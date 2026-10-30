import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { HybridCartItem, Product } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Plus, Sparkles, ShoppingCart } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const MEDICATION_TO_OTC_SUGGESTIONS: Record<string, string[]> = {
  lisinopril: ["Blood Pressure Monitor", "Low Sodium", "Heart Health"],
  metformin: ["Blood Glucose Monitor", "Diabetic", "Sugar Free"],
  atorvastatin: ["Heart Health", "Cholesterol", "Fish Oil", "Omega"],
  levothyroxine: ["Thyroid", "Energy", "Vitamin D"],
  omeprazole: ["Antacid", "Digestive", "Probiotic"],
  metoprolol: ["Blood Pressure", "Heart Health", "Relaxation"],
  amlodipine: ["Blood Pressure", "Heart", "Circulation"],
  losartan: ["Blood Pressure", "Heart Health", "Potassium"],
  gabapentin: ["Pain Relief", "Sleep", "Nerve Health"],
  sertraline: ["Sleep", "Relaxation", "Stress Relief", "Mood Support"],
  escitalopram: ["Sleep", "Relaxation", "Stress Relief", "Mood Support"],
  fluoxetine: ["Sleep", "Relaxation", "Stress Relief", "Mood Support"],
  prednisone: ["Immune Support", "Vitamin C", "Zinc"],
  amoxicillin: ["Probiotic", "Immune Support", "Vitamin C"],
  azithromycin: ["Probiotic", "Immune Support"],
  ibuprofen: ["Pain Relief", "Cold Pack", "Heating Pad"],
  acetaminophen: ["Pain Relief", "Cold", "Fever"],
  naproxen: ["Pain Relief", "Anti-Inflammatory"],
  hydrochlorothiazide: ["Electrolyte", "Potassium", "Hydration"],
  furosemide: ["Electrolyte", "Potassium", "Hydration"],
  warfarin: ["Vitamin K", "Blood Test"],
  clopidogrel: ["Heart Health", "Aspirin Free"],
  alprazolam: ["Sleep", "Relaxation", "Chamomile"],
  lorazepam: ["Sleep", "Relaxation", "Melatonin"],
  zolpidem: ["Sleep", "Eye Mask", "Relaxation"],
  tramadol: ["Pain Relief", "Heating Pad", "Cold Pack"],
  oxycodone: ["Pain Relief", "Stool Softener"],
  insulin: ["Blood Glucose", "Diabetic", "Glucose Tablets"],
  albuterol: ["Asthma", "Inhaler Spacer", "Air Purifier"],
  fluticasone: ["Allergy", "Saline Spray", "Air Purifier"],
  cetirizine: ["Allergy", "Eye Drops", "Tissues"],
  loratadine: ["Allergy", "Eye Drops", "Nasal"],
  diphenhydramine: ["Sleep", "Allergy", "Eye Drops"],
  montelukast: ["Allergy", "Asthma", "Air Purifier"],
  pantoprazole: ["Antacid", "Digestive", "Probiotic"],
  famotidine: ["Antacid", "Digestive"],
  ranitidine: ["Antacid", "Digestive"],
  citalopram: ["Sleep", "Relaxation", "Stress"],
  bupropion: ["Energy", "Focus", "Mood"],
  duloxetine: ["Pain", "Sleep", "Mood"],
  venlafaxine: ["Sleep", "Stress", "Mood"],
  trazodone: ["Sleep", "Melatonin", "Relaxation"],
};

function getSuggestionKeywords(medicationName: string): string[] {
  const normalizedName = medicationName.toLowerCase();
  
  for (const [medication, keywords] of Object.entries(MEDICATION_TO_OTC_SUGGESTIONS)) {
    if (normalizedName.includes(medication)) {
      return keywords;
    }
  }
  
  if (normalizedName.includes("statin")) return ["Heart Health", "Cholesterol", "Fish Oil"];
  if (normalizedName.includes("pril")) return ["Blood Pressure", "Heart Health"];
  if (normalizedName.includes("sartan")) return ["Blood Pressure", "Heart Health"];
  if (normalizedName.includes("cycline")) return ["Probiotic", "Immune Support"];
  if (normalizedName.includes("cillin")) return ["Probiotic", "Immune Support"];
  if (normalizedName.includes("profen")) return ["Pain Relief", "Cold Pack"];
  if (normalizedName.includes("prazole")) return ["Antacid", "Digestive", "Probiotic"];
  if (normalizedName.includes("tidine")) return ["Antacid", "Digestive"];
  
  return ["Wellness", "Vitamin", "Health"];
}

interface SmartUpsellsProps {
  cartItems: HybridCartItem[];
}

export function SmartUpsells({ cartItems }: SmartUpsellsProps) {
  const { toast } = useToast();
  
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const prescriptionItems = cartItems.filter(
    (item) => item.itemType === "prescription" && item.prescription
  );

  const productIdsInCart = new Set(
    cartItems.filter((item) => item.productId).map((item) => item.productId)
  );

  const suggestedProducts = useMemo(() => {
    if (prescriptionItems.length === 0 || products.length === 0) {
      return [];
    }

    const allKeywords = new Set<string>();
    prescriptionItems.forEach((item) => {
      if (item.prescription?.medicationName) {
        const keywords = getSuggestionKeywords(item.prescription.medicationName);
        keywords.forEach((keyword) => allKeywords.add(keyword.toLowerCase()));
      }
    });

    if (allKeywords.size === 0) {
      return [];
    }

    const scoredProducts = products
      .filter((product) => product.inStock && !productIdsInCart.has(product.id))
      .map((product) => {
        const productText = `${product.name} ${product.description || ""} ${product.category || ""}`.toLowerCase();
        let score = 0;

        allKeywords.forEach((keyword) => {
          if (productText.includes(keyword)) {
            score += 2;
          }
          const keywordParts = keyword.split(" ");
          keywordParts.forEach((part) => {
            if (part.length > 3 && productText.includes(part)) {
              score += 1;
            }
          });
        });

        return { product, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.product);

    return scoredProducts;
  }, [prescriptionItems, products, productIdsInCart]);

  const addToCartMutation = useMutation({
    mutationFn: async (productId: string) => {
      await apiRequest("POST", "/api/cart", { productId, quantity: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to Cart",
        description: "Product has been added to your cart.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add product to cart.",
        variant: "destructive",
      });
    },
  });

  if (prescriptionItems.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (suggestedProducts.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Recommended For You</CardTitle>
              <p className="text-xs text-muted-foreground">
                Based on your prescriptions
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence>
            <div className="grid grid-cols-2 gap-3">
              {suggestedProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full rounded-md object-cover"
                          loading="lazy"
                          decoding="async"
                          width="40"
                          height="40"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {product.category}
                    </Badge>
                  </div>

                  <h4 className="mb-1 line-clamp-2 text-xs font-medium leading-tight">
                    {product.name}
                  </h4>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary">
                      ${parseFloat(product.price).toFixed(2)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => addToCartMutation.mutate(product.id)}
                      disabled={addToCartMutation.isPending}
                      data-testid={`button-upsell-add-${product.id}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span className="text-xs">Add</span>
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>

          {suggestedProducts.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"
            >
              <ShoppingCart className="h-3 w-3" />
              <span>Add these to complement your medications</span>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
