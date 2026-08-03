const { createClient } = require('@supabase/supabase-js');

// RLS is off on these tables (single-user personal app, same pattern as the
// eBay tool and family wishlist), so the anon/publishable key is fine here —
// no service role key needed.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = { supabase };
