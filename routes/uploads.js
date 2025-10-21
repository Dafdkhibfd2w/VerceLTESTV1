const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateUser } = require('../middlewares/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads', req.user.TenantID);
    
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * POST /api/upload
 * General file upload endpoint
 */
router.post('/upload', authenticateUser, upload.array('files', 10), async (req, res) => {
  try {
    const { type } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'No files uploaded'
      });
    }

    // Process files based on type
    const processedFiles = files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedAt: new Date()
    }));

    // Log the upload
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.create({
      TenantID: req.user.TenantID,
      UserID: req.user.UserID,
      action: 'file_upload',
      details: {
        type,
        fileCount: files.length,
        files: processedFiles.map(f => f.originalname)
      }
    });

    res.json({
      ok: true,
      message: 'Files uploaded successfully',
      files: processedFiles
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      ok: false,
      message: 'Upload failed',
      error: error.message
    });
  }
});

/**
 * GET /api/uploads
 * List uploaded files
 */
router.get('/uploads', authenticateUser, async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, '../uploads', req.user.TenantID);
    
    try {
      const files = await fs.readdir(uploadDir);
      const fileDetails = await Promise.all(
        files.map(async (filename) => {
          const filepath = path.join(uploadDir, filename);
          const stats = await fs.stat(filepath);
          
          return {
            filename,
            size: stats.size,
            uploadedAt: stats.mtime,
            type: path.extname(filename)
          };
        })
      );

      res.json({
        ok: true,
        files: fileDetails
      });

    } catch (error) {
      // Directory doesn't exist yet
      res.json({
        ok: true,
        files: []
      });
    }

  } catch (error) {
    console.error('List uploads error:', error);
    res.status(500).json({
      ok: false,
      message: 'Failed to list uploads'
    });
  }
});

/**
 * DELETE /api/uploads/:filename
 * Delete an uploaded file
 */
router.delete('/uploads/:filename', authenticateUser, async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '../uploads', req.user.TenantID, filename);

    // Security: Make sure the path is within the tenant's directory
    const uploadDir = path.join(__dirname, '../uploads', req.user.TenantID);
    const resolvedPath = path.resolve(filepath);
    
    if (!resolvedPath.startsWith(uploadDir)) {
      return res.status(403).json({
        ok: false,
        message: 'Access denied'
      });
    }

    await fs.unlink(filepath);

    // Log the deletion
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.create({
      TenantID: req.user.TenantID,
      UserID: req.user.UserID,
      action: 'file_delete',
      details: { filename }
    });

    res.json({
      ok: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      ok: false,
      message: 'Failed to delete file'
    });
  }
});

module.exports = router;
