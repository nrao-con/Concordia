import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Product } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Trash2, Pencil, Package, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const CATEGORIES = [
  "otc", "wellness", "vitamins", "Vitamins", "Supplements", "Pain Relief",
  "Cold & Flu", "Allergy", "First Aid", "Sleep Aid", "Digestive",
  "Skin", "Dental", "diabetes", "heart-vitality", "weight-management",
  "mens-womens-health", "grocery", "Snacks", "Beverages", "Candy",
  "Chocolate", "Food",
];

const EMPTY_FORM = {
  name: "", category: "otc", description: "", price: "",
  stockQuantity: 0, inStock: true, requiresPrescription: false, imageUrl: "",
};

type ProductForm = typeof EMPTY_FORM;

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) return fallback;
  const responseBody = error.message.match(/^\d+:\s*([\s\S]*)$/)?.[1];
  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      if (typeof parsed.message === "string") return parsed.message;
    } catch {
      // Preserve non-JSON server responses below.
    }
  }
  return error.message;
}

export default function AdminInventory() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/products"] });
      toast({ title: "Product deleted", description: "Product removed from inventory." });
      setDeleteId(null);
    },
    onError: (error) => toast({ title: "Delete failed", description: getApiErrorMessage(error, "Could not delete product."), variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: ProductForm) =>
      apiRequest("POST", "/api/admin/products", {
        ...data,
        price: data.price.toString(),
        stockQuantity: Number(data.stockQuantity),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/products"] });
      toast({ title: "Product added", description: "New product is now in inventory." });
      setAddOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (error) => toast({ title: "Failed to add product", description: getApiErrorMessage(error, "Could not add product."), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductForm }) =>
      apiRequest("PATCH", `/api/admin/products/${id}`, {
        ...data,
        price: data.price.toString(),
        stockQuantity: Number(data.stockQuantity),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/products"] });
      toast({ title: "Product updated" });
      setEditProduct(null);
    },
    onError: (error) => toast({ title: "Update failed", description: getApiErrorMessage(error, "Could not update product."), variant: "destructive" }),
  });

  const toggleStockMutation = useMutation({
    mutationFn: ({ id, inStock }: { id: string; inStock: boolean }) =>
      apiRequest("PATCH", `/api/admin/products/${id}`, { inStock }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/products"] });
      toast({ title: "Stock status updated" });
    },
    onError: (error) => toast({ title: "Update failed", description: getApiErrorMessage(error, "Could not update product stock status."), variant: "destructive" }),
  });

  function openEdit(p: Product) {
    setForm({
      name: p.name,
      category: p.category,
      description: p.description ?? "",
      price: String(p.price),
      stockQuantity: p.stockQuantity ?? 0,
      inStock: p.inStock,
      requiresPrescription: p.requiresPrescription,
      imageUrl: p.imageUrl ?? "",
    });
    setEditProduct(p);
  }

  function handleSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProduct) return;
    updateMutation.mutate({ id: editProduct.id, data: form });
  }

  const inStockCount = products.filter((p) => p.inStock).length;
  const outOfStockCount = products.filter((p) => !p.inStock).length;

  return (
    <AdminLayout title="Inventory">
      <div className="admin-page-shell admin-table-workspace p-4 md:p-6 space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold mt-1" data-testid="text-total-products">
                {isLoading ? "Loading" : products.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">In Stock</p>
              <p className="text-2xl font-bold mt-1 text-emerald-500" data-testid="text-in-stock-count">
                {isLoading ? "Loading" : inStockCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Out of Stock</p>
              <p className="text-2xl font-bold mt-1 text-rose-500" data-testid="text-out-of-stock-count">
                {isLoading ? "Loading" : outOfStockCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Table card */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Products</CardTitle>
                <CardDescription>Add, edit, or remove products from the shop.</CardDescription>
              </div>
              <Button onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }} data-testid="button-add-product">
                <Plus className="h-4 w-4 mr-2" /> Add Product
              </Button>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-inventory-search"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Package className="h-10 w-10 opacity-30" />
                <p className="text-sm">{search ? "No products match your search." : "No products yet. Add one to get started."}</p>
              </div>
            ) : (
               <div className="admin-table-frame overflow-x-auto">
                 <Table className="admin-dense-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((product) => (
                      <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                        <TableCell className="font-medium max-w-[200px] truncate" data-testid={`text-product-name-${product.id}`}>
                          {product.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {product.category}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-product-price-${product.id}`}>
                          ${parseFloat(String(product.price)).toFixed(2)}
                        </TableCell>
                        <TableCell data-testid={`text-product-stock-${product.id}`}>
                          {product.stockQuantity ?? "Not available"}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleStockMutation.mutate({ id: product.id, inStock: !product.inStock })}
                            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
                            data-testid={`button-toggle-stock-${product.id}`}
                            title={product.inStock ? "Click to mark out of stock" : "Click to mark in stock"}
                          >
                            {product.inStock
                              ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-emerald-500">In Stock</span></>
                              : <><XCircle className="h-4 w-4 text-rose-500" /><span className="text-rose-500">Out of Stock</span></>
                            }
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(product)}
                              data-testid={`button-edit-product-${product.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(product.id)}
                              data-testid={`button-delete-product-${product.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Product Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-product">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Fill in the details to add a new product to the shop.</DialogDescription>
          </DialogHeader>
          <ProductForm
            form={form}
            setForm={setForm}
            onSubmit={handleSubmitAdd}
            isPending={createMutation.isPending}
            submitLabel="Add Product"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={!!editProduct} onOpenChange={(o) => { if (!o) setEditProduct(null); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-product">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update the product details below.</DialogDescription>
          </DialogHeader>
          <ProductForm
            form={form}
            setForm={setForm}
            onSubmit={handleSubmitEdit}
            isPending={updateMutation.isPending}
            submitLabel="Save Changes"
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the product from your inventory and the shop. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function ProductForm({
  form, setForm, onSubmit, isPending, submitLabel,
}: {
  form: ProductForm;
  setForm: (f: ProductForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const set = (key: keyof ProductForm, value: unknown) =>
    setForm({ ...form, [key]: value });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="pf-name">Product Name</Label>
          <Input
            id="pf-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Vitamin C 1000mg"
            required
            data-testid="input-product-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-category">Category</Label>
          <Select value={form.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger id="pf-category" data-testid="select-product-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-price">Price ($)</Label>
          <Input
            id="pf-price"
            type="number"
            step="0.01"
            min="0.01"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="9.99"
            required
            data-testid="input-product-price"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-stock">Stock Quantity</Label>
          <Input
            id="pf-stock"
            type="number"
            min="0"
            value={form.stockQuantity}
            onChange={(e) => set("stockQuantity", Number(e.target.value))}
            data-testid="input-product-stock"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-status">Status</Label>
          <Select
            value={form.inStock ? "in-stock" : "out-of-stock"}
            onValueChange={(v) => set("inStock", v === "in-stock")}
          >
            <SelectTrigger id="pf-status" data-testid="select-product-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in-stock">In Stock</SelectItem>
              <SelectItem value="out-of-stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="pf-image">Image URL (optional)</Label>
          <Input
            id="pf-image"
            value={form.imageUrl}
            onChange={(e) => set("imageUrl", e.target.value)}
            placeholder="https://..."
            data-testid="input-product-image"
          />
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="pf-desc">Description (optional)</Label>
          <Textarea
            id="pf-desc"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Short product description..."
            data-testid="input-product-description"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={isPending} data-testid="button-submit-product">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
