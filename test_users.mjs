import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cgngdeaknmqvyprfayll.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnbmdkZWFrbm1xdnlwcmZheWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjgyMTIsImV4cCI6MjA4MzkwNDIxMn0.KKDcxCZ01McFlqDp0IiD8FBzDSPpdZsmZy19xrrLKAo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllowedUsers() {
    const { data, error } = await supabase.from('allowed_users').select('*');
    if (error) {
        console.error("Error fetching users:", error);
    } else {
        console.log("Allowed Users:");
        data.forEach(user => console.log(user.email, "|", user.role));
    }
}

checkAllowedUsers();
