import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { staffApi, StaffProduct } from "@/lib/staffApi";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Minus, Plus, PackageCheck, PackageX, RefreshCw, Globe, Smartphone, Trash2 } from "lucide-react";

const PRODUCTS_KEY = ["/api/staff/products"];

const OTC_CATEGORIES = [
  "otc", "vitamins", "supplements", "personal_care", "first_aid",
  "baby_care", "beauty", "grocery", "household", "medical_devices", "other",
];

function StockBadge({ qty }: { qty: number }) {
  if (qty <= 0) {
    return (
      <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1 shrink-0">
        <PackageX className="h-3 w-3" />
        Out of stock
      </Badge>
    );
  }
  if (qty <= 5) {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
        Low: {qty}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
      <PackageCheck className="h-3 w-3" />
      {qty} in stock
    </Badge>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
  testId,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  checked: boolean;
  onToggle: () => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onToggle}
      disabled={disabled}
      className="flex items-center justify-between w-full p-3 rounded-md border hover-elevate disabled:opacity-60"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function AddProductSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: StaffProduct) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("otc");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(0);
  const [ndc, setNdc] = useState("");

  useEffect(() => {
    if (open) {
      setName(""); setCategory("otc"); setPrice(""); setQty(0); setNdc("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      staffApi.createProduct({
        name: name.trim(),
        category,
        price,
        stockQuantity: qty,
        ndc: ndc.trim() || undefined,
      }),
    onSuccess: (product) => {
      queryClient.setQueryData<StaffProduct[]>(PRODUCTS_KEY, (old = []) => [product, ...old]);
      toast({ title: "Product added", description: product.name });
      onCreated(product);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not create product.", variant: "destructive" });
    },
  });

  const valid = name.trim().length > 0 && /^\d+(\.\d{1,2})?$/.test(price);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-xl p-0">
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="text-base">Add Product</SheetTitle>
          <p className="text-sm text-muted-foreground">New products appear on the website and patient app immediately.</p>
        </SheetHeader>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium block mb-1">Product name *</label>
            <Input
              data-testid="input-new-product-name"
              placeholder="e.g. Aspirin 325mg"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Category *</label>
            <select
              data-testid="select-new-product-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {OTC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Price ($) *</label>
            <Input
              data-testid="input-new-product-price"
              placeholder="e.g. 9.99"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Initial stock quantity</label>
            <div className="flex items-center gap-3">
              <Button
                data-testid="button-new-qty-decrease"
                size="icon"
                variant="outline"
                onClick={() => setQty((q) => Math.max(0, q - 1))}
                disabled={qty <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                data-testid="input-new-product-qty"
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="text-center text-xl font-semibold w-24"
              />
              <Button
                data-testid="button-new-qty-increase"
                size="icon"
                variant="outline"
                onClick={() => setQty((q) => q + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">NDC / barcode <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input
              data-testid="input-new-product-ndc"
              placeholder="e.g. 12345-6789-01"
              value={ndc}
              onChange={(e) => setNdc(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              data-testid="button-create-product"
              className="flex-1"
              disabled={!valid || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Product
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose} data-testid="button-cancel-add-product">
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProductEditSheet({
  product,
  open,
  onClose,
  onSaveStock,
  onToggleVisibility,
  onDelete,
  isSavingStock,
  isTogglingVisibility,
  isDeleting,
}: {
  product: StaffProduct | null;
  open: boolean;
  onClose: () => void;
  onSaveStock: (id: string, newQty: number) => void;
  onToggleVisibility: (id: string, field: "showOnWebsite" | "showInApp", value: boolean) => void;
  onDelete: (id: string) => void;
  isSavingStock: boolean;
  isTogglingVisibility: boolean;
  isDeleting: boolean;
}) {
  const [qty, setQty] = useState<number>(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && product) {
      setQty(product.stockQuantity ?? 0);
    }
  }, [open, product?.id]);

  if (!product) return null;

  const delta = qty - product.stockQuantity;
  const deltaLabel =
    delta === 0 ? "" : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="rounded-t-xl p-0">
          <SheetHeader className="p-5 border-b">
            <SheetTitle className="text-base">{product.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">{product.category}</p>
          </SheetHeader>

          <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Stock adjustment */}
            <div>
              <p className="text-sm font-medium mb-3">Stock quantity</p>
              <div className="flex items-center gap-4">
                <Button
                  data-testid="button-stock-decrease"
                  size="icon"
                  variant="outline"
                  onClick={() => setQty((q) => Math.max(0, q - 1))}
                  disabled={qty <= 0 || isSavingStock}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex flex-col items-center gap-0.5">
                  <Input
                    data-testid="input-stock-qty"
                    type="number"
                    min={0}
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                    className="text-center text-xl font-semibold w-24"
                    disabled={isSavingStock}
                  />
                  {deltaLabel && (
                    <span
                      className={`text-xs font-medium ${
                        delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}
                      data-testid="text-stock-delta"
                    >
                      {deltaLabel}
                    </span>
                  )}
                </div>
                <Button
                  data-testid="button-stock-increase"
                  size="icon"
                  variant="outline"
                  onClick={() => setQty((q) => q + 1)}
                  disabled={isSavingStock}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                data-testid="button-save-stock"
                className="flex-1"
                disabled={isSavingStock || delta === 0}
                onClick={() => onSaveStock(product.id, qty)}
              >
                {isSavingStock ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save{delta !== 0 ? ` (${deltaLabel})` : ""}
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
                data-testid="button-cancel-stock"
              >
                Cancel
              </Button>
            </div>

            {/* Visibility toggles */}
            <div>
              <p className="text-sm font-medium mb-3">Visibility</p>
              <div className="space-y-2">
                <ToggleRow
                  icon={Globe}
                  label="Show on website"
                  checked={product.showOnWebsite}
                  onToggle={() =>
                    onToggleVisibility(product.id, "showOnWebsite", !product.showOnWebsite)
                  }
                  testId="toggle-show-website"
                  disabled={isTogglingVisibility}
                />
                <ToggleRow
                  icon={Smartphone}
                  label="Show in app"
                  checked={product.showInApp}
                  onToggle={() =>
                    onToggleVisibility(product.id, "showInApp", !product.showInApp)
                  }
                  testId="toggle-show-app"
                  disabled={isTogglingVisibility}
                />
              </div>
            </div>

            {/* Delete */}
            <div className="pt-1 border-t">
              <Button
                data-testid="button-delete-product"
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={isDeleting}
                onClick={() => setConfirmDelete(true)}
              >
                {isDeleting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete product
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{product.name}</strong> from the website and patient app. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDelete(false);
                onClose();
                onDelete(product.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function StaffInventory() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editProduct, setEditProduct] = useState<StaffProduct | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery<StaffProduct[]>({
    queryKey: PRODUCTS_KEY,
    queryFn: () => staffApi.getProducts(),
    refetchInterval: 30_000,
  });

  const currentEditProduct =
    editProduct && products.length > 0
      ? products.find((p) => p.id === editProduct.id) ?? editProduct
      : editProduct;

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.ndc?.toLowerCase().includes(q) ||
      p.externalId?.toLowerCase().includes(q) ||
      String(p.id).toLowerCase().includes(q)
    );
  });

  const updateStock = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      staffApi.updateStock(id, delta),
    onMutate: async ({ id, delta }) => {
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY });
      const previous = queryClient.getQueryData<StaffProduct[]>(PRODUCTS_KEY);
      queryClient.setQueryData<StaffProduct[]>(PRODUCTS_KEY, (old = []) =>
        old.map((p) =>
          p.id === id
            ? { ...p, stockQuantity: Math.max(0, (p.stockQuantity ?? 0) + delta), inStock: Math.max(0, (p.stockQuantity ?? 0) + delta) > 0 }
            : p
        )
      );
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<StaffProduct[]>(PRODUCTS_KEY, (old = []) =>
        old.map((p) => (p.id === updated.id ? updated : p))
      );
      toast({ title: "Stock updated" });
    },
    onError: (err: any, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PRODUCTS_KEY, context.previous);
      }
      toast({ title: "Error", description: err.message || "Could not update stock.", variant: "destructive" });
    },
  });

  const updateVisibility = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: "showOnWebsite" | "showInApp"; value: boolean }) =>
      staffApi.updateVisibility(id, { [field]: value }),
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY });
      const previous = queryClient.getQueryData<StaffProduct[]>(PRODUCTS_KEY);
      queryClient.setQueryData<StaffProduct[]>(PRODUCTS_KEY, (old = []) =>
        old.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<StaffProduct[]>(PRODUCTS_KEY, (old = []) =>
        old.map((p) => (p.id === updated.id ? updated : p))
      );
      toast({ title: "Visibility updated" });
    },
    onError: (err: any, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PRODUCTS_KEY, context.previous);
      }
      toast({ title: "Error", description: err.message || "Could not update visibility.", variant: "destructive" });
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => staffApi.deleteProduct(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY });
      const previous = queryClient.getQueryData<StaffProduct[]>(PRODUCTS_KEY);
      queryClient.setQueryData<StaffProduct[]>(PRODUCTS_KEY, (old = []) =>
        old.filter((p) => p.id !== id)
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: "Product deleted" });
    },
    onError: (err: any, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PRODUCTS_KEY, context.previous);
      }
      toast({ title: "Error", description: err.message || "Could not delete product.", variant: "destructive" });
    },
  });

  return (
    <div className="h-full flex flex-col">
      {/* Search bar + Add button */}
      <div className="p-4 border-b shrink-0 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-product-search"
            placeholder="Search by name, NDC, or product ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          data-testid="button-add-product"
          size="icon"
          onClick={() => setAddOpen(true)}
          title="Add product"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto divide-y">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <Search className="h-8 w-8 opacity-30" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          filtered.map((product) => (
            <button
              key={product.id}
              data-testid={`row-product-${product.id}`}
              onClick={() => setEditProduct(product)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate"
            >
              <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                <PackageCheck className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="font-medium text-sm truncate"
                  data-testid={`text-product-name-${product.id}`}
                >
                  {product.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{product.category}</p>
              </div>

              <StockBadge qty={product.stockQuantity ?? 0} />
            </button>
          ))
        )}
      </div>

      <ProductEditSheet
        product={currentEditProduct}
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        onSaveStock={(id, newQty) => {
          const current = products.find((p) => p.id === id);
          const delta = newQty - (current?.stockQuantity ?? 0);
          if (delta !== 0) updateStock.mutate({ id, delta });
        }}
        onToggleVisibility={(id, field, value) =>
          updateVisibility.mutate({ id, field, value })
        }
        onDelete={(id) => deleteProduct.mutate(id)}
        isSavingStock={updateStock.isPending}
        isTogglingVisibility={updateVisibility.isPending}
        isDeleting={deleteProduct.isPending}
      />

      <AddProductSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {}}
      />
    </div>
  );
}
