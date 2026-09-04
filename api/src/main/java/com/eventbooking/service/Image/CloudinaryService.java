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
	 * Delivery URL for a stored public id. Only the public id is persisted
	 * (see V11), so this is where the URL comes from - change a transformation
	 * or the cloud name and every URL follows on the next read, with no stored
	 * column left pointing at the old one.
	 */
	public String urlFor(String publicId) {
		return publicId == null ? null : cloudinary.url().secure(true).generate(publicId);
	}

}
