export type ShopCategoryProduct = {
  name: string;
  category?: string | null;
};

const GENERIC_CATEGORIES = new Set(["", "general", "other", "uncategorized"]);

const NAME_GROUPS: Array<{ category: string; names: string[] }> = [
  {
    category: "Candy & Snacks",
    names: [
      "Hersheys", "Hershey's", "Reeses", "Reese's", "Butterfinger", "Blow Pops", "Tootsie", "Junior Mints",
      "Mr Goodbar", "Sugar Daddy", "Fluffy Stuff", "Sweet Pops", "Sweet & Sour Pops",
      "Whatchamacallit", "York Peppermint",
    ],
  },
  {
    category: "First Aid & Medical Supplies",
    names: [
      "alcohol swabsticks", "cotton tip", "drain SG", "sponge NW SG", "Tegaderm",
      "gauze", "bandages",
    ],
  },
  {
    category: "Pain Relief",
    names: ["Tylenol", "ibuprofen", "acetaminophen"],
  },
  {
    category: "Eye Care",
    names: ["Soothe DR", "eye drops"],
  },
  {
    category: "Personal Care",
    names: ["Veet"],
  },
  {
    category: "Vitamins & Nutrition",
    names: ["Juven", "vitamins"],
  },
  {
    category: "Digestive Care",
    names: ["Colon Cleanse"],
  },
];

function hasRecognizableName(name: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(name);
}

/** Presentation-only category normalization for browsing; never changes product data. */
export function getShopCategory(product: ShopCategoryProduct): string {
  const staffCategory = product.category?.trim() ?? "";
  if (!GENERIC_CATEGORIES.has(staffCategory.toLowerCase())) return staffCategory;

  for (const group of NAME_GROUPS) {
    if (group.names.some((name) => hasRecognizableName(product.name, name))) {
      return group.category;
    }
  }
  return "General";
}
