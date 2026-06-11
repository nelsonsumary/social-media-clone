import { supabase } from "./supabase.js";

const REQUIRED_COLUMNS = ["verified", "verification_token", "google_id"];

async function checkColumnsExist() {
  try {
    const { data, error } = await supabase.from("users").select("verified, verification_token, google_id").limit(1);
    if (error && error.message?.includes("column")) {
      console.warn(
        "⚠ Migration needed: new columns missing from the 'users' table.\n" +
        "  Run the SQL in backend/schema.sql in your Supabase SQL Editor:\n" +
        "  https://supabase.com/dashboard/project/omaxzjmbtqieohrgqodv/sql/new"
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function getDb() {
  const { error } = await supabase.from("users").select("id").limit(1);
  if (error) throw error;
  console.log("Connected to Supabase");
  await checkColumnsExist();
  return supabase;
}

export { getDb };
