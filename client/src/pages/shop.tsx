import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCart } from "@/hooks/useGuestCart";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Product } from "@shared/schema";
import { Header } from "@/components/header";
import { MotionButton } from "@/components/motion-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Search, Package, Plus, Minus, Check, UserPlus, ShoppingCart,
  Sparkles, Brain, Leaf,
  Star, Lock, Send, Zap, Gift,
  Pill, Stethoscope, Eye, ArrowRight, Link2, RefreshCcw
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageTransition } from "@/components/page-transition";
import { getBaseSeason, getSeasonByThemeKey } from "@/lib/seasonal-calendar";
import { getSeasonStyle } from "@/lib/season-banners";
import { getAvailableProductQuantity } from "@shared/cart-utils";
import { useSeasonalTheme } from "@/hooks/useSeasonalTheme";
import { SeasonalMark } from "@/components/seasonal-mark";
import { getShopCategory } from "@/lib/shop-categories";
import { selectWeeklyPicks } from "@/lib/shop-weekly-picks";

const INTENT_CATEGORY_MAP: Record<string, string[]> = {
  wellness: ["wellness", "immunity", "vitamins", "supplements", "vitamin", "supplement"],
  pain: ["pain", "joints", "relief", "joint", "muscle"],
  skin: ["skin", "aesthetics", "beauty", "skincare", "dermal"],
  headache: ["headache", "focus", "migraine", "cognitive", "brain"],
  digestive: ["digestive", "stomach", "gut", "probiotic", "digestion"],
  dental: ["dental", "oral", "tooth", "mouth", "teeth"],
};

const CATEGORY_LABEL_MAP: Record<string, string> = {
  rx: "RX", "weight-management": "Weight Mgmt", diabetes: "Diabetes", "heart-vitality": "Heart", "mens-womens-health": "Health", wellness: "Wellness", pain: "Pain", skin: "Skin", headache: "Headache", digestive: "Digestive", dental: "Dental", otc: "OTC", grocery: "Grocery",
  "Pain Relief": "Pain Relief", Vitamins: "Vitamins", Supplements: "Supplements", "Cold & Flu": "Cold & Flu", "First Aid": "First Aid", "Sleep Aid": "Sleep Aid", Allergy: "Allergy",
};

const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  "Pain Relief": ["First Aid", "Cold & Flu"],
  "First Aid": ["Pain Relief", "Allergy"],
  Vitamins: ["Supplements", "wellness"],
  Supplements: ["Vitamins", "wellness"],
  "Cold & Flu": ["Pain Relief", "Allergy"],
  Allergy: ["Cold & Flu", "First Aid"],
  "Sleep Aid": ["Supplements", "Vitamins"],
  otc: ["Vitamins", "Supplements"],
  grocery: ["Vitamins", "Supplements"],
  wellness: ["Vitamins", "Supplements"],
  pain: ["Pain Relief", "First Aid"],
  skin: ["Vitamins", "Supplements"],
  headache: ["Pain Relief", "Sleep Aid"],
  digestive: ["Supplements", "Vitamins"],
  dental: ["First Aid", "Pain Relief"],
};

function getCategoryLabel(category: string | null | undefined): string {
  const normalized = (category ?? "").trim().toLowerCase();
  const mapped = Object.entries(CATEGORY_LABEL_MAP).find(([key]) => key.toLowerCase() === normalized)?.[1];
  if (mapped) return mapped;
  if (!normalized) return "General";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/-/g, " ");
}

function ProductDetailModal({ product, allProducts, isOpen, onClose, onAddToCart, isAuthenticated, addedToCart, isPending }: {
  product: Product | null;
  allProducts: Product[];
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (productId: string, quantity?: number) => void;
  isAuthenticated: boolean;
  addedToCart: Set<string>;
  isPending: boolean;
}) {
  const [currentProduct, setCurrentProduct] = useState<Product | null>(product);
  const [linkCopied, setLinkCopied] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    if (product) setCurrentProduct(product);
    setQuantity(1);
  }, [product]);

  const handleCopyLink = useCallback(() => {
    if (!currentProduct) return;
    const url = `${window.location.origin}/shop?product=${currentProduct.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      toast({ description: "Link copied to clipboard" });
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [currentProduct, toast]);

  if (!currentProduct) return null;

  const similarProducts = allProducts.filter(
    (p) => p.id !== currentProduct.id && p.category === currentProduct.category && p.inStock
  ).slice(0, 4);

  const complementaryCategories = COMPLEMENTARY_CATEGORIES[currentProduct.category] || [];
  const complementaryProducts = allProducts.filter(
    (p) => p.id !== currentProduct.id && complementaryCategories.includes(p.category) && p.inStock
  ).slice(0, 4);

  const isAdded = addedToCart.has(currentProduct.id);
  const availableQuantity = getAvailableProductQuantity(currentProduct);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl p-0 bg-[hsl(222 47% 8%)] border-white/[0.1]" data-testid="product-detail-modal" data-lenis-prevent>
        <DialogTitle className="sr-only">{currentProduct.name}</DialogTitle>
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="md:w-1/2">
              <div className="aspect-square rounded-md bg-slate-800/50 overflow-hidden flex items-center justify-center">
                {currentProduct.imageUrl ? (
                  <img
                    src={currentProduct.imageUrl}
                    alt={currentProduct.name}
                    className="h-full w-full object-cover"
                    decoding="async"
                    width="600"
                    height="600"
                    data-testid="product-detail-image"
                  />
                ) : (
                  <Package className="h-16 w-16 text-slate-400" />
                )}
              </div>
            </div>

            <div className="md:w-1/2 space-y-4">
              <div>
                <Badge variant="secondary" className="mb-2 text-xs" data-testid="product-detail-category">
                  {getCategoryLabel(getShopCategory(currentProduct))}
                </Badge>
                <div className="flex items-start gap-2">
                  <h2 className="text-2xl font-bold text-white flex-1" data-testid="product-detail-name">{currentProduct.name}</h2>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleCopyLink}
                    className="shrink-0 text-slate-400 hover:text-white mt-0.5"
                    title="Copy link to this product"
                    data-testid="button-copy-product-link"
                  >
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <p className="text-slate-200 text-sm leading-relaxed" data-testid="product-detail-description">
                {currentProduct.description || "Quality healthcare product from Concordia Pharmacy."}
              </p>

              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-white" data-testid="product-detail-price">
                  ${parseFloat(currentProduct.price).toFixed(2)}
                </span>
                {availableQuantity > 0 ? (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/20 bg-emerald-500/5 text-xs" data-testid="product-detail-stock">
                    In Stock
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-red-400 border-red-500/20 bg-red-500/5 text-xs" data-testid="product-detail-stock">
                    Out of Stock
                  </Badge>
                )}
              </div>

              <MotionButton
                onClick={() => onAddToCart(currentProduct.id, quantity)}
                disabled={availableQuantity <= 0 || isPending || isAdded}
                className="w-full gap-2"
                data-testid="product-detail-add-to-cart"
              >
                {isAdded ? (
                  <><Check className="h-4 w-4" /> Added to Cart</>
                ) : availableQuantity <= 0 ? (
                  <>Coming Soon</>
                ) : (
                  <><ShoppingCart className="h-4 w-4" /> Add to Cart</>
                )}
              </MotionButton>
              {availableQuantity > 0 && !isAdded && (
                <div className="flex items-center justify-center gap-3" data-testid="product-detail-quantity-controls">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    data-testid="product-detail-decrease"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-8 text-center font-semibold" data-testid="product-detail-quantity">{quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((value) => Math.min(availableQuantity, value + 1))}
                    disabled={quantity >= availableQuantity}
                    aria-label="Increase quantity"
                    data-testid="product-detail-increase"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {!isAuthenticated && (
                <p className="text-xs text-slate-300 text-center mt-2">
                  <Link href="/signup" className="text-primary hover:text-primary/70">Sign up</Link> to earn loyalty points on every purchase
                </p>
              )}
            </div>
          </div>

          {similarProducts.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white/[0.06]">
              <h3 className="text-lg font-semibold text-white mb-4">Similar Products</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {similarProducts.map((p) => (
                  <MotionButton
                    key={p.id}
                    variant="ghost"
                    onClick={() => setCurrentProduct(p)}
                    className="text-left h-auto rounded-2xl border border-white/[0.08] bg-white/[0.045] shadow-md p-3 flex-col items-start no-default-hover-elevate"
                    data-testid={`similar-product-${p.id}`}
                  >
                    <div className="aspect-[4/3] rounded-md bg-slate-800/50 overflow-hidden flex items-center justify-center mb-2">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" decoding="async" width="160" height="120" />
                      ) : (
                        <Package className="h-6 w-6 text-slate-400" />
                      )}
                    </div>
                    <p className="text-xs font-medium text-white line-clamp-2">{p.name}</p>
                    <p className="text-xs text-slate-300 mt-1">${parseFloat(p.price).toFixed(2)}</p>
                  </MotionButton>
                ))}
              </div>
            </div>
          )}

          {complementaryProducts.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/[0.06]">
              <h3 className="text-lg font-semibold text-white mb-4">You Might Also Like</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {complementaryProducts.map((p) => (
                  <MotionButton
                    key={p.id}
                    variant="ghost"
                    onClick={() => setCurrentProduct(p)}
                    className="text-left h-auto rounded-2xl border border-white/[0.08] bg-white/[0.045] shadow-md p-3 flex-col items-start no-default-hover-elevate"
                    data-testid={`complementary-product-${p.id}`}
                  >
                    <div className="aspect-[4/3] rounded-md bg-slate-800/50 overflow-hidden flex items-center justify-center mb-2">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" decoding="async" width="160" height="120" />
                      ) : (
                        <Package className="h-6 w-6 text-slate-400" />
                      )}
                    </div>
                    <div className="flex items-start gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white line-clamp-2">{p.name}</p>
                        <p className="text-xs text-slate-300 mt-1">${parseFloat(p.price).toFixed(2)}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[9px] mt-0.5">{getCategoryLabel(getShopCategory(p))}</Badge>
                    </div>
                  </MotionButton>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OtcProductCard({ product, isAdded, onAdd, isPending, onViewDetail }: {
  product: Product;
  isAdded: boolean;
  onAdd: (quantity: number) => void;
  isPending: boolean;
  onViewDetail: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const availableQuantity = getAvailableProductQuantity(product);

  useEffect(() => {
    setImageFailed(false);
  }, [product.id, product.imageUrl]);

  return (
    <motion.div
       className="group relative h-full rounded-2xl border border-white/[0.08] bg-white/[0.045] shadow-lg overflow-visible transition-colors duration-300 hover:border-white/[0.14] hover:bg-white/[0.06] cursor-pointer"
      onClick={onViewDetail}
      data-testid={`product-card-${product.id}`}
    >
      <div className="h-full p-4 flex flex-col">
        <button
          type="button"
          className="mb-3 flex aspect-[4/3] w-full items-center justify-center rounded-md bg-slate-800/50 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          onClick={(event) => {
            event.stopPropagation();
            onViewDetail();
          }}
          aria-label={`View details for ${product.name}`}
          data-testid={`button-view-product-${product.id}`}
        >
          {product.imageUrl && !imageFailed ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              width="300"
              height="225"
            />
          ) : (
            <Package className="h-12 w-12 text-slate-400" />
          )}
        </button>

        <div className="space-y-2 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug flex-1">{product.name}</h3>
            <Badge variant="secondary" className="shrink-0 text-[10px]">{getCategoryLabel(getShopCategory(product))}</Badge>
          </div>

          <p className="text-xs text-slate-300 line-clamp-2">{product.description || "Quality healthcare product"}</p>
           <p className={`text-xs font-medium ${availableQuantity > 0 ? "text-emerald-300" : "text-slate-400"}`}>
             {availableQuantity > 0 ? "Available at Concordia" : "Currently unavailable"}
           </p>

          <div className="flex items-center justify-between gap-3 pt-1 mt-auto">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-white" data-testid={`price-${product.id}`}>
                ${parseFloat(product.price).toFixed(2)}
              </span>
            </div>

            <MotionButton
              size="sm"
              onClick={(e) => { e.stopPropagation(); onAdd(quantity); }}
              disabled={availableQuantity <= 0 || isPending || isAdded}
              className="gap-1.5"
              data-testid={`button-add-to-cart-${product.id}`}
            >
              {isAdded ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Added
                </>
              ) : availableQuantity <= 0 ? (
                <>Coming Soon</>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </>
              )}
            </MotionButton>
          </div>
          {availableQuantity > 0 && !isAdded && (
            <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()} data-testid={`quantity-controls-${product.id}`}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={quantity <= 1}
                aria-label={`Decrease ${product.name} quantity`}
                data-testid={`button-decrease-shop-${product.id}`}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="min-w-5 text-center text-xs font-semibold" data-testid={`quantity-shop-${product.id}`}>{quantity}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQuantity((value) => Math.min(availableQuantity, value + 1))}
                disabled={quantity >= availableQuantity}
                aria-label={`Increase ${product.name} quantity`}
                data-testid={`button-increase-shop-${product.id}`}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MilestoneBanner({ rewards, monthsActive }: { rewards: Array<{ type: string; label: string; description: string }>; monthsActive: number }) {
  const { toast } = useToast();
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async (rewardType: string) => {
    setClaiming(true);
    try {
      const res = await apiRequest("POST", "/api/loyalty/milestone-claim", { rewardType });
      const data = await res.json();
      toast({ title: "Reward Claimed!", description: data.description });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/milestone-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/points/wallet"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to claim reward", variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-2xl border border-green-500/20 bg-green-500/[0.06] shadow-md p-4"
      data-testid="banner-milestone-reward"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-green-500/20 p-2">
            <Gift className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-sm text-green-300">
              Congratulations! You've unlocked your loyalty milestone reward
            </p>
            <p className="text-xs text-slate-300 mt-0.5">
              {monthsActive} months as a valued member. Choose your reward below.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 ml-12">
        {rewards.map((reward) => (
          <MotionButton
            key={reward.type}
            size="sm"
            variant="outline"
            className="gap-1.5 border-green-500/30 text-green-300"
            disabled={claiming}
            onClick={() => handleClaim(reward.type)}
            data-testid={`button-claim-${reward.type}`}
          >
            <Gift className="h-3.5 w-3.5" />
            {reward.label}
          </MotionButton>
        ))}
      </div>
    </motion.div>
  );
}

export default function Shop() {
  const { toast } = useToast();
  const {
    isAuthenticated,
    isAdmin,
    user,
    hasSelectedPatient,
    patientAuthReady,
  } = useAuth();
  const isPatientAuthenticated =
    patientAuthReady && isAuthenticated && !isAdmin && (!!user || hasSelectedPatient);
  const guestCart = useGuestCart();
  const seasonalTheme = useSeasonalTheme();
  const previewKey = new URLSearchParams(window.location.search).get("theme");
  const previewSeason = previewKey ? getSeasonByThemeKey(previewKey) : null;
  const season = previewSeason ?? seasonalTheme?.season ?? getBaseSeason();
  const activeHoliday = previewSeason ? null : seasonalTheme?.holiday ?? null;
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") ?? "";
  });
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [sortOrder, setSortOrder] = useState<"relevance" | "price-low" | "price-high" | "name">("relevance");
  const [selectedCategory, setSelectedCategory] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("category") ?? "all";
  });
  const [addedToCart, setAddedToCart] = useState<Set<string>>(new Set());
  const [specialRequest, setSpecialRequest] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const sourcingIdempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sourcing-${Date.now()}-${Math.random()}`,
  );
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const memberSectionRef = useRef<HTMLDivElement>(null);
  const memberInView = useInView(memberSectionRef, { once: true, amount: 0.3 });

  const { data: products = [], isLoading, isError: productsError, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ["/api/public/products"],
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const [weeklyPicksNow, setWeeklyPicksNow] = useState(() => new Date());

  useEffect(() => {
    const refreshClock = () => setWeeklyPicksNow(new Date());
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshClock();
    };
    const interval = window.setInterval(refreshClock, 60_000);
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("product");
    if (!productId || products.length === 0) return;
    const match = products.find((p) => p.id === productId);
    if (match) {
      setSelectedProduct(match);
      setDetailOpen(true);
    }
  }, [products]);

  type MilestoneStatus = {
    eligible: boolean;
    monthsActive: number;
    hasPrescriptions: boolean;
    alreadyClaimed: boolean;
    rewards: Array<{ type: string; label: string; description: string }>;
  };

  const { data: milestoneData } = useQuery<MilestoneStatus>({
    queryKey: ["/api/loyalty/milestone-status"],
    enabled: isPatientAuthenticated,
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      await apiRequest("POST", "/api/cart", { productId, quantity });
    },
    onSuccess: (_, { productId, quantity }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      setAddedToCart((prev) => new Set(prev).add(productId));
      setTimeout(() => {
        setAddedToCart((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      }, 2000);
      toast({
        title: "Added to Cart",
        description: `${quantity} ${quantity === 1 ? "item" : "items"} added to your cart.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add product to cart.",
        variant: "destructive",
      });
    },
  });

  const handleAddToCart = useCallback((productId: string, quantity = 1) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const availableQuantity = getAvailableProductQuantity(product);
    if (availableQuantity <= 0) {
      toast({ title: "Coming Soon", description: "This product is currently unavailable." });
      return;
    }
    const requestedQuantity = Math.min(Math.max(1, Math.floor(quantity)), availableQuantity);
    if (isPatientAuthenticated) {
      addToCartMutation.mutate({ productId, quantity: requestedQuantity });
    } else {
      guestCart.addItem(productId, requestedQuantity, availableQuantity);
      setAddedToCart((prev) => new Set(prev).add(productId));
      setTimeout(() => {
        setAddedToCart((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      }, 2000);
      toast({ title: "Added to Cart", description: "Product added. Sign up to earn loyalty points!" });
    }
  }, [isPatientAuthenticated, addToCartMutation, guestCart, products, toast]);

  const otcProducts = useMemo(() => products.filter((p) => !p.requiresPrescription), [products]);
  const weeklyPicks = useMemo(
    () => selectWeeklyPicks(otcProducts, weeklyPicksNow, 4),
    [otcProducts, weeklyPicksNow],
  );

  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, Product[]>();
    otcProducts.forEach((product) => {
      const category = getShopCategory(product);
      const group = grouped.get(category);
      if (group) group.push(product);
      else grouped.set(category, [product]);
    });
    return Array.from(grouped, ([name, groupProducts]) => ({ name, count: groupProducts.length, products: groupProducts }))
      .sort((a, b) => {
        const last = (name: string) => name === "General" ? 2 : name === "Candy & Snacks" ? 1 : 0;
        return last(a.name) - last(b.name) || a.name.localeCompare(b.name);
      });
  }, [otcProducts]);

  const activeCategory = useMemo(() => {
    const queryCategory = selectedCategory.trim().toLowerCase();
    if (!queryCategory || queryCategory === "all") return "all";
    const exactCategory = categoryGroups.find((group) => group.name.trim().toLowerCase() === queryCategory);
    if (exactCategory) return exactCategory.name;

    const aliases = INTENT_CATEGORY_MAP[queryCategory] ?? [];
    const hasAliasMatch = categoryGroups.some((group) => aliases.some((alias) =>
      group.products.some((product) =>
        (product.category ?? "").toLowerCase().includes(alias) ||
        getShopCategory(product).toLowerCase().includes(alias),
      ),
    ));
    return hasAliasMatch ? queryCategory : "all";
  }, [categoryGroups, selectedCategory]);

  const matchesSearch = useCallback((product: Product) => {
    const query = debouncedSearch.toLowerCase();
    return !query ||
      product.name.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      getShopCategory(product).toLowerCase().includes(query);
  }, [debouncedSearch]);

  const sortProducts = useCallback((items: Product[]) => [...items].sort((a, b) => {
    if (sortOrder === "name") return a.name.localeCompare(b.name);
    if (sortOrder === "price-low") return parseFloat(a.price) - parseFloat(b.price);
    if (sortOrder === "price-high") return parseFloat(b.price) - parseFloat(a.price);
    return otcProducts.indexOf(a) - otcProducts.indexOf(b);
  }), [otcProducts, sortOrder]);

  const visibleGroups = categoryGroups
    .filter((group) => {
      if (activeCategory === "all" || group.name === activeCategory) return true;
      const aliases = INTENT_CATEGORY_MAP[activeCategory] ?? [];
      return aliases.some((alias) => group.products.some((product) =>
        (product.category ?? "").toLowerCase().includes(alias) ||
        getShopCategory(product).toLowerCase().includes(alias),
      ));
    })
    .map((group) => ({ ...group, products: sortProducts(group.products.filter(matchesSearch)) }))
    .filter((group) => group.products.length > 0);
  const filteredProductCount = visibleGroups.reduce((count, group) => count + group.products.length, 0);

  const specialRequestMutation = useMutation({
    mutationFn: async (requestText: string) => {
      await apiRequest("POST", "/api/concierge/sourcing-inquiry", {
        inquiryText: requestText,
        idempotencyKey: sourcingIdempotencyKeyRef.current,
      });
    },
    onSuccess: () => {
      toast({ title: "Pending Request Received", description: "Our team will review the sourcing inquiry. Availability, prescription requirements, and timing require staff confirmation." });
      setRequestSubmitted(true);
      setSpecialRequest("");
      sourcingIdempotencyKeyRef.current = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sourcing-${Date.now()}-${Math.random()}`;
      setTimeout(() => setRequestSubmitted(false), 5000);
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message || "Something went wrong. Please try again or call us at (718) 328-2833.",
        variant: "destructive",
      });
    },
  });

  const handleSpecialRequest = () => {
    if (!specialRequest.trim()) return;
    specialRequestMutation.mutate(specialRequest.trim());
  };

  return (
    <PageTransition>
      <SEO
        title="OTC Shop"
        description="Browse Concordia Pharmacy's online OTC shop. Vitamins, supplements, first aid, personal care, and wellness products with free local delivery and loyalty rewards."
        path="/shop"
      />
      <div className="min-h-screen clinical-dark-page" style={{ background: "hsl(222 47% 6%)" }}>
        <Header />

        {/* Compact seasonal context keeps the catalog in the first viewport. */}
        {(() => {
          const sStyle = getSeasonStyle(activeHoliday?.styleThemeKey ?? season.themeKey);
          const HeroIcon = sStyle.icon;
          return (
            <section className="relative overflow-hidden">
              {/* seasonal photo */}
              <img
                src={sStyle.bannerUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "brightness(0.55) saturate(1.1)" }}
              />
              {/* dark wash from bottom so text is readable */}
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(10,12,28,0.92) 100%)" }}
              />
              <div className="concordia-container pt-8 pb-9 relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="text-center mb-4"
                >
                  {/* seasonal eyebrow */}
                  <div className="flex items-center justify-center gap-2 mb-5">
                    <span
                      className="flex items-center justify-center w-7 h-7 rounded-full"
                      style={{ background: `${sStyle.accentColor}22`, border: `1px solid ${sStyle.accentColor}55` }}
                    >
                      <HeroIcon className="w-3.5 h-3.5" style={{ color: sStyle.accentColor }} />
                    </span>
                    <span
                      className="text-sm font-semibold uppercase tracking-widest"
                      style={{ color: sStyle.accentColor }}
                    >
                      {season.name}
                    </span>
                    {activeHoliday && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium normal-case tracking-normal"
                        style={{
                          color: sStyle.accentColor,
                          borderColor: `${sStyle.accentColor}55`,
                          backgroundColor: `${sStyle.accentColor}12`,
                        }}
                        data-testid="shop-holiday-badge"
                      >
                        <SeasonalMark decoration={activeHoliday.decoration} size={16} />
                        <span>{activeHoliday.name}</span>
                      </span>
                    )}
                  </div>

                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Everyday care, close to home.</h1>
                  <p className="text-sm md:text-base text-slate-300 max-w-2xl mx-auto">Browse OTC essentials and wellness products with clear pricing and real availability.</p>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="text-center text-xs text-slate-400 mt-3 max-w-xl mx-auto"
                >
                  All prescription medications require a valid prescription from your doctor. Ask your provider to send your RX to Concordia Pharmacy, or call us at{" "}
                  <a href="tel:+17183282833" className="hover:text-white transition-colors" style={{ color: sStyle.accentColor }}>(718) 328-2833</a> to transfer an existing prescription.
                </motion.p>
              </div>
            </section>
          );
        })()}

        <section className="relative" style={{ background: "hsl(222 47% 6%)" }}>
          <div className="concordia-container py-12">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Shop everyday essentials</h2>
              <p className="text-slate-200">Find what you need, check availability, and add it with confidence.</p>
            </motion.div>

            <div className="mb-6 rounded-2xl border border-white/[0.1] bg-white/[0.045] p-3 md:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="search"
                    placeholder="Search OTC products by name or category"
                    aria-label="Search OTC products"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 pl-9 bg-white/[0.06] border-white/[0.12] text-white placeholder:text-slate-400"
                    data-testid="input-search-products"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="shop-sort">Sort products</label>
                  <select id="shop-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
                    className="h-11 w-full sm:w-auto rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ colorScheme: "dark" }}>
                    <option value="relevance" style={{ backgroundColor: "hsl(222 47% 8%)", color: "#fff" }}>Recommended order</option>
                    <option value="name" style={{ backgroundColor: "hsl(222 47% 8%)", color: "#fff" }}>Name A–Z</option>
                    <option value="price-low" style={{ backgroundColor: "hsl(222 47% 8%)", color: "#fff" }}>Price: low to high</option>
                    <option value="price-high" style={{ backgroundColor: "hsl(222 47% 8%)", color: "#fff" }}>Price: high to low</option>
                  </select>
                </div>
              </div>
            </div>

            <section className="mb-7" aria-labelledby="browse-categories-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id="browse-categories-title" className="text-lg font-semibold text-white">Browse by category</h3>
                  <p className="mt-0.5 text-sm text-slate-400">Choose a department to narrow the catalog.</p>
                </div>
                <span className="text-xs text-slate-400">{otcProducts.length} items in the catalog</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  aria-pressed={activeCategory === "all"}
                  className={`inline-flex min-h-11 items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222_47%_6%)] ${
                    activeCategory === "all"
                      ? "border-primary/60 bg-primary/20 text-white"
                      : "border-white/[0.12] bg-white/[0.045] text-slate-200"
                  }`}
                  data-testid="button-category-all"
                >
                  <span>All Products</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs ${activeCategory === "all" ? "bg-primary/30 text-white" : "bg-white/[0.08] text-slate-300"}`}>{otcProducts.length}</span>
                </button>
                {categoryGroups.map((group) => {
                  const isActive = activeCategory === group.name;
                  return (
                    <button
                      key={group.name}
                      type="button"
                      onClick={() => setSelectedCategory(group.name)}
                      aria-pressed={isActive}
                      className={`inline-flex min-h-11 items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222_47%_6%)] ${
                        isActive
                          ? "border-primary/60 bg-primary/20 text-white"
                          : "border-white/[0.12] bg-white/[0.045] text-slate-200"
                      }`}
                      data-testid={`button-category-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                    >
                      <span>{getCategoryLabel(group.name)}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs ${isActive ? "bg-primary/30 text-white" : "bg-white/[0.08] text-slate-300"}`}>{group.count}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {!isLoading && !productsError && !searchQuery.trim() && activeCategory === "all" && weeklyPicks.length > 0 && (
              <section className="mb-8" aria-labelledby="weekly-picks-title" data-testid="section-weekly-picks">
                <div className="mb-4">
                  <h3 id="weekly-picks-title" className="text-lg font-semibold text-white">This week’s picks</h3>
                  <p className="mt-0.5 text-sm text-slate-400">A fresh selection from our in-stock inventory.</p>
                </div>
                <div className="concordia-card-grid concordia-card-grid-4">
                  {weeklyPicks.map((product) => (
                    <OtcProductCard
                      key={product.id}
                      product={product}
                      isAdded={addedToCart.has(product.id)}
                      onAdd={(quantity) => handleAddToCart(product.id, quantity)}
                      isPending={addToCartMutation.isPending}
                      onViewDetail={() => { setSelectedProduct(product); setDetailOpen(true); }}
                    />
                  ))}
                </div>
              </section>
            )}

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-slate-300" aria-live="polite">
                {isLoading ? "Loading products…" : `${filteredProductCount} ${filteredProductCount === 1 ? "product" : "products"}${debouncedSearch ? ` for “${debouncedSearch}”` : ""}`}
              </p>
              {(debouncedSearch || activeCategory !== "all" || selectedCategory !== "all" || sortOrder !== "relevance") && (
                <button type="button" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); setSortOrder("relevance"); }}
                  className="inline-flex items-center gap-1.5 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
                  <RefreshCcw className="h-3.5 w-3.5" /> Clear filters
                </button>
              )}
            </div>

            {productsError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-8 text-center" role="alert">
                <p className="font-semibold text-white">We couldn’t load the shop.</p>
                <p className="mt-1 text-sm text-slate-300">Please try again. Your cart and prescription services are unaffected.</p>
                <Button variant="outline" className="mt-4 gap-2" onClick={() => refetchProducts()}><RefreshCcw className="h-4 w-4" /> Try again</Button>
              </div>
            ) : isLoading ? (
              <div className="concordia-card-grid concordia-card-grid-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-72 bg-white/[0.03]" />
                ))}
              </div>
            ) : filteredProductCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-white/[0.04] p-6 mb-4">
                  <Package className="h-10 w-10 text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-white mb-1">No Products Found</p>
                <p className="text-sm text-slate-300 max-w-sm">
                  Try a different search or browse another category above.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {visibleGroups.map((group) => (
                  <section key={group.name} aria-labelledby={`category-heading-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-white/[0.1] pb-3">
                      <h3 id={`category-heading-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="text-lg font-semibold text-white">
                        {getCategoryLabel(group.name)}
                      </h3>
                      <span className="text-sm text-slate-400">{group.products.length} {group.products.length === 1 ? "item" : "items"}</span>
                    </div>
                    <div className="concordia-card-grid concordia-card-grid-4">
                      {group.products.map((product) => (
                        <OtcProductCard
                          key={product.id}
                          product={product}
                          isAdded={addedToCart.has(product.id)}
                          onAdd={(quantity) => handleAddToCart(product.id, quantity)}
                          isPending={addToCartMutation.isPending}
                          onViewDetail={() => { setSelectedProduct(product); setDetailOpen(true); }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {!isAuthenticated && (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="mt-8 rounded-2xl border border-primary/10 bg-primary/[0.04] shadow-md p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                data-testid="banner-signup-incentive"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Star className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-white">Become a member to earn loyalty points and unlock exclusive rewards</p>
                    <p className="text-xs text-slate-300">Members who bring prescriptions for 3 months get a free item or 10% off</p>
                  </div>
                </div>
                <Link href="/signup">
                  <MotionButton size="sm" className="gap-1.5 shrink-0" data-testid="button-signup-shop">
                    <UserPlus className="h-4 w-4" />
                    Sign Up Free
                  </MotionButton>
                </Link>
              </motion.div>
            )}

            {isAuthenticated && milestoneData?.eligible && (
              <div className="mt-8">
                <MilestoneBanner rewards={milestoneData.rewards} monthsActive={milestoneData.monthsActive} />
              </div>
            )}
          </div>
        </section>

        <section
          ref={memberSectionRef}
          className="relative overflow-hidden"
          style={{
            background: "linear-gradient(180deg, hsl(222 47% 6%) 0%, hsl(222 47% 5%) 40%, hsl(222 47% 4%) 100%)",
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
          </div>

          <div className="concordia-container py-20 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={memberInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="max-w-2xl mx-auto"
            >
              <div className="relative rounded-2xl border border-white/[0.1] bg-white/[0.045] shadow-lg p-8 md:p-12 text-center"
                   style={{ boxShadow: "0 10px 30px rgba(0, 0, 0, 0.28)" }}
              >
                <div className="absolute -top-px left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 mb-6">
                  <Lock className="h-3 w-3 text-amber-400" />
                  <span className="text-xs font-medium text-amber-400">Member Exclusive</span>
                </div>

                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  Not on the list?{" "}
                  <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
                    We hunt it down for you.
                  </span>
                </h2>
                <p className="text-slate-200 mb-8 max-w-lg mx-auto">
                  Can't find what you need? Tell us the specialty medication you're looking for. Our team will source it and ship it exclusively for you.
                </p>

                {isPatientAuthenticated ? (
                  <div className="space-y-4">
                    <Textarea
                      placeholder="Tell us the specialty med you need. Our team will source and ship it exclusively for you..."
                      value={specialRequest}
                      onChange={(e) => setSpecialRequest(e.target.value)}
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-400 resize-none min-h-[100px]"
                      data-testid="input-special-request"
                    />
                    <AnimatePresence mode="wait">
                      {requestSubmitted ? (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center gap-2 text-emerald-400 py-2"
                        >
                          <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Request submitted. We'll be in touch!</span>
                        </motion.div>
                      ) : (
                        <MotionButton
                          onClick={handleSpecialRequest}
                          disabled={!specialRequest.trim()}
                          className="gap-2 w-full sm:w-auto"
                          data-testid="button-submit-special-request"
                        >
                          <Send className="h-4 w-4" />
                          Submit Request
                        </MotionButton>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300">Sign up to access our exclusive medication sourcing service.</p>
                    <Link href="/signup">
                      <MotionButton className="gap-2" data-testid="button-signup-member-exclusive">
                        <UserPlus className="h-4 w-4" />
                        Become a Member
                      </MotionButton>
                    </Link>
                  </div>
                )}

                <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-10 border-t border-white/5">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm text-slate-300 mb-3">
              Looking for specialty medications like biologics, oncology, or behavioral health therapies?
            </p>
            <Link href="/specialty">
              <MotionButton variant="outline" size="sm" className="gap-2 backdrop-blur-sm" data-testid="button-shop-specialty-crosslink">
                <Pill className="h-4 w-4" />
                Visit Our Specialty Hub
                <ArrowRight className="h-4 w-4" />
              </MotionButton>
            </Link>
          </div>
        </section>

        <div className="py-6 text-center" style={{ background: "hsl(222 47% 4%)" }}>
          <p className="text-xs text-slate-400">
            Prescription medications are dispensed only with a valid prescription from your doctor. OTC and wellness products are available for immediate purchase. Call <a href="tel:+17183282833" className="text-slate-300 hover:text-slate-200">(718) 328-2833</a> to transfer a prescription.
          </p>
        </div>

        <ProductDetailModal
          product={selectedProduct}
          allProducts={otcProducts}
          isOpen={detailOpen}
          onClose={() => { setDetailOpen(false); setSelectedProduct(null); }}
          onAddToCart={handleAddToCart}
          isAuthenticated={isAuthenticated}
          addedToCart={addedToCart}
          isPending={addToCartMutation.isPending}
        />
      </div>
    </PageTransition>
  );
}
