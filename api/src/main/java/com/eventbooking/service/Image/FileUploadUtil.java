package com.eventbooking.service.Image;

import com.eventbooking.service.Image.error.EmptyUploadException;
import com.eventbooking.service.Image.error.FileTooLargeException;
import com.eventbooking.service.Image.error.UnsupportedFileTypeException;
import lombok.experimental.UtilityClass;
import org.apache.commons.io.FilenameUtils;
import org.springframework.web.multipart.MultipartFile;

import java.security.SecureRandom;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@UtilityClass
public class FileUploadUtil {

	public static final long Max_filesize = 2 * 1024 * 1024;

	// `.+` rather than `[^\s]+`: "beach party.jpg" is a perfectly ordinary
	// filename and the old pattern rejected every name containing a space.
	// jpeg is listed because that is what most phone cameras actually produce.
	// The (?i) that used to be inline is dropped - CASE_INSENSITIVE below
	// already covers it.
	public static final String Image_parttern = "^.+\\.(jpg|jpeg|png|gif|bmp)$";

	// The same list in a form that can be shown to whoever is uploading. Keep
	// it in step with the pattern above.
	public static final String Allowed_extensions = "jpg, jpeg, png, gif, bmp";

	public static final String Date_format = "yyyyMMddHHmmss";
	public static final String File_name_format = "%s_%s_%s";

	// UTC, like every other timestamp in the app (see spring.jpa.properties
	// hibernate.jdbc.time_zone). DateTimeFormatter is immutable and thread
	// safe, so unlike SimpleDateFormat it can be a shared constant.
	private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern(Date_format);

	public static boolean isAllowedExtension(final String filename, final String pattern) {
		final Matcher matcher = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(filename);
		return matcher.matches();
	}

	public static void assertAllow(final MultipartFile file, final String pattern) {
		if (file == null || file.isEmpty()) {
			throw new EmptyUploadException();
		}

		final long size = file.getSize();
		if (size > Max_filesize) {
			throw new FileTooLargeException(size, Max_filesize);
		}

		// getOriginalFilename() is whatever the client claimed. Some clients
		// send a full path ("C:\Users\me\photo.jpg"), so strip it before the
		// extension check - and never trust it as a path afterwards.
		final String filename = FilenameUtils.getName(file.getOriginalFilename());
		final String extension = FilenameUtils.getExtension(filename);

		if (filename == null || filename.isBlank()) {
			throw new UnsupportedFileTypeException("", "", Allowed_extensions);
		}

		if (!isAllowedExtension(filename, pattern)) {
			throw new UnsupportedFileTypeException(filename, extension, Allowed_extensions);
		}
	}

	public static String getFileName(final String name) {
		// getBaseName strips both directories and any extension the caller
		// passed in. This value ends up inside the Cloudinary public_id, which
		// is slash-delimited, so a name like "../../secret" must not survive
		// into it as path segments.
		final String safeName = FilenameUtils.getBaseName(name);
		final String date = TIMESTAMP.format(ZonedDateTime.now(ZoneOffset.UTC));
		// The timestamp is only second-granular, so two uploads of the same
		// name within one second would produce one public_id - and Cloudinary
		// overwrites by default, silently replacing the first image. The
		// random suffix is what makes the id unique; it is not a secret.
		return String.format(File_name_format, safeName, date, randomSuffix());
	}


	private static final SecureRandom RANDOM = new SecureRandom();

	private static String randomSuffix() {
		return Long.toHexString(RANDOM.nextLong() & 0xFFFFFFFFL);
	}

}
