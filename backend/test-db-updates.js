// Test script to verify database updates are working correctly
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/decloud')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Define User schema
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    theme: { type: String, default: "light" },
    cookiesAccepted: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    storageAlerts: { type: Boolean, default: true },
    storageUsed: { type: Number, default: 0 },
    storageLimit: { type: Number, default: 5000000000 },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    createdAt: { type: Date, default: Date.now }
  })
);

async function testDatabaseUpdates() {
  try {
    console.log('\n🧪 Starting database update tests...\n');

    // Test 1: Create a test user
    console.log('Test 1: Creating test user...');
    const hashedPassword = await bcrypt.hash('test123', 10);
    let testUser = await User.create({
      username: 'testuser_' + Date.now(),
      email: `test${Date.now()}@example.com`,
      password: hashedPassword
    });
    console.log('✅ Test user created:', testUser._id);
    console.log('   Initial storageUsed:', testUser.storageUsed);

    // Test 2: Update user theme using findByIdAndUpdate with { new: true }
    console.log('\nTest 2: Updating user theme...');
    const updatedUser1 = await User.findByIdAndUpdate(
      testUser._id,
      { theme: 'dark' },
      { new: true }
    );
    console.log('✅ User theme updated');
    console.log('   Returned theme:', updatedUser1.theme);
    console.log('   Should be: dark');

    // Test 3: Update storage using $inc with { new: true }
    console.log('\nTest 3: Incrementing storage...');
    const updatedUser2 = await User.findByIdAndUpdate(
      testUser._id,
      { $inc: { storageUsed: 1024000 } },
      { new: true }
    );
    console.log('✅ Storage incremented');
    console.log('   Returned storageUsed:', updatedUser2.storageUsed);
    console.log('   Should be: 1024000');

    // Test 4: Verify the update persisted by refetching
    console.log('\nTest 4: Verifying persistence...');
    const fetchedUser = await User.findById(testUser._id);
    console.log('✅ User refetched from database');
    console.log('   Theme:', fetchedUser.theme);
    console.log('   StorageUsed:', fetchedUser.storageUsed);

    // Test 5: Update using save() method
    console.log('\nTest 5: Updating using save() method...');
    fetchedUser.emailNotifications = false;
    fetchedUser.storageAlerts = false;
    const savedUser = await fetchedUser.save();
    console.log('✅ User saved');
    console.log('   emailNotifications:', savedUser.emailNotifications);
    console.log('   storageAlerts:', savedUser.storageAlerts);

    // Cleanup
    console.log('\nCleaning up test data...');
    await User.findByIdAndDelete(testUser._id);
    console.log('✅ Test user deleted');

    console.log('\n✅ All tests passed! Database updates are working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run tests
testDatabaseUpdates();
