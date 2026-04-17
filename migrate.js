const { query } = require('./server/db');

async function runMigration() {
    try {
        console.log('Running database migrations...');
        
        // Add columns to messages table
        try {
            await query('ALTER TABLE messages ADD COLUMN reply_to_id INT NULL');
            await query('ALTER TABLE messages ADD CONSTRAINT fk_messages_reply FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL');
            console.log('Added reply_to_id to messages');
        } catch (e) { console.log('messages.reply_to_id might already exist', e.message); }
        
        try {
            await query('ALTER TABLE messages ADD COLUMN forwarded_from VARCHAR(100) NULL');
            console.log('Added forwarded_from to messages');
        } catch (e) { console.log('messages.forwarded_from might already exist', e.message); }
        
        // Add columns to private_messages table
        try {
            await query('ALTER TABLE private_messages ADD COLUMN reply_to_id INT NULL');
            await query('ALTER TABLE private_messages ADD CONSTRAINT fk_pm_reply FOREIGN KEY (reply_to_id) REFERENCES private_messages(id) ON DELETE SET NULL');
            console.log('Added reply_to_id to private_messages');
        } catch (e) { console.log('private_messages.reply_to_id might already exist', e.message); }
        
        try {
            await query('ALTER TABLE private_messages ADD COLUMN forwarded_from VARCHAR(100) NULL');
            console.log('Added forwarded_from to private_messages');
        } catch (e) { console.log('private_messages.forwarded_from might already exist', e.message); }
        
        console.log('Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
