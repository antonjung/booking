import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://urncbgicbxjwniebfjgt.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_O6DWhtJU9_f_73ifFY_qcQ_2AgKxVeK'

const supabase = createClient(supabaseUrl, supabaseAnonKey)
export default supabase
