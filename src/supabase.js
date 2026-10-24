import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aucksurcmgkzuulpwuvu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qhaNCJwGGNi9mUERYDFVAg_tPw1O1HU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);