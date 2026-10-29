"use server";

import { revalidatePath } from "next/cache";
import { checkSettings, type SettingsInput } from "@/lib/office-forms";
import { createClient } from "@/lib/supabase/server";

export type SettingsResult = { ok: true } | { ok: false; errors: Record<string, string>; error?: string };

/** Saves company settings (office only, database rule; every change is logged). */
export async function saveSettings(input: SettingsInput): Promise<SettingsResult> {
  const checked = checkSettings(input);
  if (!checked.ok) return { ok: false, errors: checked.errors, error: "Fix the marked fields." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").update(checked.value).eq("id", true).select("id");
  if (error) {
    console.error("Settings save failed", error.code);
    return { ok: false, errors: {}, error: error.code === "22023" ? error.message : "Couldn't save. Try again." };
  }
  if (!data?.length) return { ok: false, errors: {}, error: "Only the bookkeeper or owner can change settings." };
  revalidatePath("/", "layout");
  return { ok: true };
}
