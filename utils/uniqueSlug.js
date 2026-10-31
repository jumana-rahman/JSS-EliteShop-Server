export async function uniqueSlug(collection, base, excludeId) {
  const root = base || "item";
  let slug = root;
  let suffix = 1;

  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await collection.findOne(query, { projection: { _id: 1 } });
    if (!existing) return slug;

    suffix += 1;
    slug = `${root}-${suffix}`;
  }
}
