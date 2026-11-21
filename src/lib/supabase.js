import { createClient } from '@supabase/supabase-js';

// Anon key is public by design (it was already in the old index.html); RLS is
// off on the meal planner tables, same as the API functions.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://phesmbmeeblrqmviikca.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZXNtYm1lZWJscnFtdmlpa2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTUyMjMsImV4cCI6MjEwMTMzMTIyM30.2SB3w2kjvrEw99dKx6TUVUjS-XKRyCkS0DdxmS4OWbw';

export const SUPABASE_URL = URL;
export const SUPABASE_ANON_KEY = KEY;
export const supabase = createClient(URL, KEY);
