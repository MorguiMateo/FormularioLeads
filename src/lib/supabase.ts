import {createClient} from "@supabase/supabase-js";

// Solo se usa la publishable / anon key (pública por diseño). La secret key NUNCA va al front.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
