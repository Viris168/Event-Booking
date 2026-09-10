package com.eventbooking.service.Image;

import com.cloudinary.Cloudinary;
import com.eventbooking.service.Image.error.ImageUploadFailedException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@Service
@Slf4j
public class CloudinaryService {

	private final Cloudinary cloudinary;
	private final String folder;

	public CloudinaryService(Cloudinary cloudinary, @Value("${app.cloudinary.folder}") String folder) {
		this.cloudinary = cloudinary;
		this.folder = folder;
	}

	public CloudinaryResponse upload(MultipartFile file, String fileName) {
		FileUploadUtil.assertAllow(file, FileUploadUtil.Image_parttern);

		final String publicId = folder + "/" + FileUploadUtil.getFileName(fileName);

		try {
			final Map<?, ?> result = cloudinary.uploader()
					.upload(file.getBytes(), Map.of("public_id", publicId));
			return new CloudinaryResponse(
					(String) result.get("public_id"),
					(String) result.get("secure_url"));
		} catch (IOException e) {
			// Keep the cause. Without it the stack trace stops here and there
			// is no way to tell a Cloudinary rejection from a read failure on
			// the uploaded part.
			throw new ImageUploadFailedException(e);
		}
	}

	/**
	 * Remove a stored asset. Called when an image is replaced or cleared -
	 * without it every replacement leaves the old file behind, billed and
	 * still reachable by anyone holding its URL.
	 * <p>
	 * A failure here is logged, not thrown. The database column is what the
	 * application treats as the truth about which image an event has, and it
	 * has already been updated by the time this runs; failing the request
	 * would report a delete that did happen as an error. What is left behind
	 * is an orphaned file, not a wrong answer.
	 */
	public void destroy(String publicId) {
		if (publicId == null) {
			return;
		}
		try {
			// invalidate purges the CDN copy too, so the old image stops being
			// served from the edge cache after the record of it is gone.
			cloudinary.uploader().destroy(publicId, Map.of("invalidate", true));
		} catch (IOException e) {
			log.warn("Could not delete Cloudinary asset {}; it is now orphaned.", publicId, e);
		}
	}

	/**
	 * Delivery URL for a stored public id.
	 *
	 * <p>No longer used on the event read path - since V18 the event columns
	 * hold the delivery URL itself, so there is nothing to derive. Kept for
	 * callers that still persist a bare public id (the user avatar column).
	 */
	public String urlFor(String publicId) {
		return publicId == null ? null : cloudinary.url().secure(true).generate(publicId);
	}

	/**
	 * The public id behind one of our own delivery URLs, or null when the URL
	 * did not come from Cloudinary.
	 *
	 * <p>Since V18 an event stores a URL rather than a public id, but
	 * {@link #destroy(String)} still needs the id. A Cloudinary delivery URL
	 * carries it in the path:
	 *
	 * <pre>
	 *   https://res.cloudinary.com/&lt;cloud&gt;/image/upload/v1699/folder/name.jpg
	 *                                                          ^^^^^^^^^^^ public id
	 * </pre>
	 *
	 * Everything up to and including {@code /upload/} is prefix, an optional
	 * {@code v&lt;digits&gt;} version segment follows, and the extension is not part
	 * of the id. A null return is the signal that this image is hosted
	 * elsewhere and is therefore not ours to delete - which is exactly the
	 * behaviour wanted for an event pointed at an image on the open web.
	 */
	public String publicIdFromUrl(String url) {
		if (url == null) return null;

		int marker = url.indexOf("/upload/");
		if (marker < 0) return null;

		String path = url.substring(marker + "/upload/".length());

		// Strip a leading version segment, and any transformation segments that
		// precede it, by taking everything after the last "v<digits>/" run.
		String[] segments = path.split("/");
		int start = 0;
		for (int i = 0; i < segments.length; i++) {
			if (segments[i].matches("v\\d+")) start = i + 1;
		}
		if (start >= segments.length) return null;

		String id = String.join("/", java.util.Arrays.copyOfRange(segments, start, segments.length));

		// Drop a query string first, then the extension - in that order, since a
		// signed URL can carry a dot in its query.
		int query = id.indexOf('?');
		if (query >= 0) id = id.substring(0, query);

		int dot = id.lastIndexOf('.');
		int slash = id.lastIndexOf('/');
		if (dot > slash) id = id.substring(0, dot);

		return id.isBlank() ? null : id;
	}

}
