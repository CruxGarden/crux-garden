import { createHash, randomUUID } from "node:crypto";
import type { MigrationStore } from "../store";
/** A trusted host asserts a source binding after explicit connection/permission handling.
 * This mapping is not an Apple account identifier or evidence of system permission.
 * Call only within the runtime's serialized host-action queue.
 */
export async function resolvePhotoNamespace(
  store: MigrationStore,
  binding: string,
) {
  if (typeof binding !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(binding))
    throw new Error(
      "The native host did not provide a valid Photos source binding.",
    );
  if (!store.loadPhotoBindings || !store.savePhotoBindings)
    throw new Error("This host cannot retain Photos source bindings.");
  const saved = await store.loadPhotoBindings();
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    throw new Error(
      "Saved Photos source bindings need attention. Nothing was reset.",
    );
  const entries = Object.entries(saved);
  if (
    entries.length > 32 ||
    entries.some(
      ([key, value]) =>
        !/^[a-f0-9]{64}$/.test(key) ||
        typeof value !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value,
        ),
    )
  )
    throw new Error(
      "Saved Photos source bindings need attention. Nothing was reset.",
    );
  const bindings = Object.fromEntries(entries) as Record<string, string>;
  const key = createHash("sha256").update(binding).digest("hex");
  if (bindings[key]) return bindings[key]!;
  if (entries.length >= 32)
    throw new Error("This profile already has 32 Photos source bindings.");
  const namespace = randomUUID();
  bindings[key] = namespace;
  await store.savePhotoBindings(bindings);
  return namespace;
}
