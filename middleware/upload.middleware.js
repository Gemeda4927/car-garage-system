const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary with validation
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ CLOUDINARY CREDENTIALS MISSING! Check your .env file');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary configured with cloud:', process.env.CLOUDINARY_CLOUD_NAME);

// ============================================================================
// FILE FILTER FUNCTION
// ============================================================================

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  console.log('📁 File received:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, PDF, and DOC files are allowed`), false);
  }
};

// ============================================================================
// USE MEMORY STORAGE
// ============================================================================

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum number of files
  }
});

// ============================================================================
// UPLOAD MIDDLEWARE FUNCTIONS
// ============================================================================

const uploadSingleFile = upload.single('document');

const uploadMultipleFiles = upload.array('documents', 10);

const uploadFields = upload.fields([
  { name: 'businessLicense', maxCount: 1 },
  { name: 'certificateOfIncorporation', maxCount: 1 },
  { name: 'taxClearance', maxCount: 1 },
  { name: 'insuranceCertificate', maxCount: 1 },
  { name: 'garageAgreement', maxCount: 1 },
  { name: 'identityProof', maxCount: 1 },
  { name: 'addressProof', maxCount: 1 },
  { name: 'otherDocuments', maxCount: 10 },
  { name: 'profileImage', maxCount: 1 }  
]);


// ============================================================================
// HELPER FUNCTION TO UPLOAD TO CLOUDINARY FROM MEMORY
// ============================================================================

/**
 * Upload file from buffer to Cloudinary
 * @param {Object} file - The file object from multer
 * @returns {Promise} - Cloudinary upload result
 */
/**
 * Upload file from buffer to Cloudinary
 * @param {Object} file - The file object from multer
 * @returns {Promise} - Cloudinary upload result
 */
const uploadToCloudinary = async (file) => {
  // Validate file object
  if (!file) {
    throw new Error('No file provided');
  }

  if (!file.buffer) {
    console.error('❌ File buffer is missing:', file);
    throw new Error('File buffer is missing - file was not properly stored in memory');
  }

  if (file.buffer.length === 0) {
    throw new Error('File buffer is empty');
  }

  // Sanitize the filename - remove special characters and spaces
  const originalName = file.originalname.split('.')[0];
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9]/g, '-') // Replace special chars with hyphen
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  const publicId = `${Date.now()}-${sanitizedName}`;

  console.log('📤 Uploading to Cloudinary:', {
    fileName: file.originalname,
    sanitizedName: sanitizedName,
    publicId: publicId,
    fileSize: `${(file.size / 1024).toFixed(2)} KB`,
    mimeType: file.mimetype,
    bufferSize: file.buffer.length
  });

  return new Promise((resolve, reject) => {
    try {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'smartgarage/documents',
          resource_type: 'auto',
          public_id: publicId,
          timeout: 60000 // 60 second timeout
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', {
              message: error.message,
              name: error.name,
              http_code: error.http_code
            });
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log('✅ Cloudinary upload success:', {
              url: result.secure_url,
              public_id: result.public_id,
              format: result.format,
              size: result.bytes
            });
            resolve(result);
          }
        }
      );

      // Create read stream from buffer and pipe to upload stream
      const readableStream = streamifier.createReadStream(file.buffer);
      
      readableStream.on('error', (streamError) => {
        console.error('❌ Stream error:', streamError);
        reject(new Error(`Stream error: ${streamError.message}`));
      });

      readableStream.pipe(uploadStream);

    } catch (streamError) {
      console.error('❌ Stream creation error:', streamError);
      reject(new Error(`Failed to create upload stream: ${streamError.message}`));
    }
  });
};



/**
 * Test Cloudinary connection
 */
const testCloudinaryConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary connection test:', result);
    return true;
  } catch (error) {
    console.error('❌ Cloudinary connection test failed:', error.message);
    return false;
  }
};

// Run connection test on startup
testCloudinaryConnection();

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  uploadSingleFile,
  uploadMultipleFiles,
  uploadFields,
  uploadToCloudinary,
  testCloudinaryConnection
};