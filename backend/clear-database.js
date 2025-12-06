// Clear all user data from the database
require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/decloud';

console.log('🔄 Connecting to MongoDB...');

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(async () => {
    console.log('✅ MongoDB Connected');
    
    try {
      // Get all collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`\n📦 Found ${collections.length} collections`);
      
      // Clear all collections
      for (const collection of collections) {
        const collectionName = collection.name;
        await mongoose.connection.db.collection(collectionName).deleteMany({});
        console.log(`✅ Cleared collection: ${collectionName}`);
      }
      
      // Clear upload directories
      const uploadsDir = path.join(__dirname, 'uploads');
      const previewsDir = path.join(__dirname, 'previews');
      
      // Clear uploads folder
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        files.forEach(file => {
          const filePath = path.join(uploadsDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        });
        console.log(`✅ Cleared uploads directory (${files.length} files)`);
      }
      
      // Clear previews folder
      if (fs.existsSync(previewsDir)) {
        const files = fs.readdirSync(previewsDir);
        files.forEach(file => {
          const filePath = path.join(previewsDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        });
        console.log(`✅ Cleared previews directory (${files.length} files)`);
      }
      
      console.log('\n✨ Database cleared successfully! Ready for a fresh start.');
      console.log('💡 You can now register new users and create new groups.');
      
    } catch (err) {
      console.error('❌ Error clearing database:', err);
    } finally {
      await mongoose.connection.close();
      console.log('\n🔌 Database connection closed');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });
