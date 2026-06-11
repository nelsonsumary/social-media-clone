import { supabase } from "./supabase.js";

async function getDb() {
  const { error } = await supabase.from("users").select("id").limit(1);
  if (error) throw error;
  console.log("Connected to Supabase");
  return supabase;
}

export { getDb };
