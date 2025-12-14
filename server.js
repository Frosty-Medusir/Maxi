require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- 2. Database Connection ---
// SECURE: Now uses the environment variable from Render/.env
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
    console.error("❌ FATAL ERROR: MONGO_URI is not defined.");
    process.exit(1);
}

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// --- 3. Mongoose Schema ---
const projectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    imageUrl: { type: String, required: true },
    publicId: { type: String }, // Required to delete image from Cloudinary
    createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.model('Project', projectSchema);

// --- 4. Cloudinary Configuration ---
// SECURE: Now uses environment variables from Render/.env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer to use Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'lented-gallery', // The folder name in your Cloudinary account
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        // Auto-optimize images (resize to max 1000px width to save bandwidth)
        transformation: [{ width: 1000, crop: "limit" }] 
    },
});

const upload = multer({ storage: storage });

// --- 5. API Routes ---

// GET: Fetch all projects
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await Project.find().sort({ createdAt: -1 });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Upload new project
app.post('/api/upload', upload.single('image'), async (req, res) => {
    // Note: 'upload.single' middleware handles the upload to Cloudinary BEFORE this function runs
    
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    try {
        const newProject = new Project({
            title: req.body.title,
            category: req.body.category,
            imageUrl: req.file.path, // Cloudinary URL
            publicId: req.file.filename // Cloudinary ID
        });

        const savedProject = await newProject.save();
        res.status(201).json(savedProject);
    } catch (dbError) {
        res.status(500).json({ error: dbError.message });
    }
});

// DELETE: Remove a project
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // 1. Delete image from Cloudinary
        if (project.publicId) {
            await cloudinary.uploader.destroy(project.publicId);
        }

        // 2. Delete record from MongoDB
        await Project.findByIdAndDelete(req.params.id);
        
        res.json({ message: 'Project deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));