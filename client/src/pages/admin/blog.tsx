import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Send, Heart, Calendar, User, Briefcase, Check, Bold, Italic,
  List, ListOrdered, EyeOff, Image, X, Upload, Loader2, Pencil, Trash2,
  Smartphone, Eye, Tag, RefreshCw, Pin, PinOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BlogPost } from "@shared/schema";
import { format } from "date-fns";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

function RichTextEditor({
  content,
  onChange,
  placeholder = "Write your blog content here... Use the toolbar above for formatting.",
}: {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getText());
    },
  });

  if (!editor) return <Skeleton className="h-48" />;

  return (
    <div className="border rounded-md">
      <div className="flex gap-1 border-b p-2 bg-muted/30">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="h-8 w-8"
          data-testid="button-bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="h-8 w-8"
          data-testid="button-italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="h-8 w-8"
          data-testid="button-bullet-list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="h-8 w-8"
          data-testid="button-ordered-list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[200px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]"
        data-testid="editor-content"
      />
    </div>
  );
}

async function uploadFile(file: File): Promise<string> {
  const response = await apiRequest("GET", "/api/upload/url");
  const { uploadUrl } = await response.json();
  const uploadResponse = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed (${uploadResponse.status}).`);
  }
  return uploadUrl.split("?")[0];
}

const BLOG_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "health-tips", label: "Health Tips" },
  { value: "announcements", label: "Announcements" },
  { value: "medications", label: "Medications" },
  { value: "wellness", label: "Wellness" },
  { value: "pharmacy-news", label: "Pharmacy News" },
];

const PREDEFINED_VALUES = new Set(BLOG_CATEGORIES.map((c) => c.value));

function CategorySelector({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  // Track whether we're in custom-entry mode independently of the stored value.
  // Initialise based on whether the current value is a custom (non-predefined) slug.
  const [customMode, setCustomMode] = useState(() => value !== "" && !PREDEFINED_VALUES.has(value));

  // When parent resets value to a predefined slug (e.g. after form reset), exit custom mode.
  useEffect(() => {
    if (PREDEFINED_VALUES.has(value)) {
      setCustomMode(false);
    }
  }, [value]);

  const selectValue = customMode ? "__custom__" : value;

  const handleSelectChange = (v: string) => {
    if (v === "__custom__") {
      setCustomMode(true);
      // Keep whatever custom text was previously typed (value may already be non-predefined).
      // If value is currently predefined, clear it so the input starts blank.
      if (PREDEFINED_VALUES.has(value)) {
        onChange("");
      }
    } else {
      setCustomMode(false);
      onChange(v);
    }
  };

  return (
    <div className="space-y-2">
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent>
          {BLOG_CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
          <SelectItem value="__custom__">Other (custom)…</SelectItem>
        </SelectContent>
      </Select>
      {customMode && (
        <Input
          placeholder="Type custom category (e.g. Nutrition)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          data-testid={testId ? `${testId}-custom-input` : undefined}
        />
      )}
    </div>
  );
}

export default function AdminBlog() {
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "general",
    authorName: "",
    authorDesignation: "",
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "", category: "general", pinnedToHero: false });
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [isEditUploadingImage, setIsEditUploadingImage] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: blogs = [], isLoading, isError } = useQuery<BlogPost[]>({
    queryKey: ["/api/admin/blog"],
  });

  const refreshFeedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/blog/refresh-feed");
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Feed refreshed", description: "External health content will reload on next page visit." });
      queryClient.invalidateQueries({ queryKey: ["/api/blog/feed"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to refresh feed", variant: "destructive" });
    },
  });

  const publishedBlogs = blogs.filter((p) => p.isPublished);
  const draftBlogs = blogs.filter((p) => !p.isPublished);

  const createBlogMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/admin/blog", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Blog post created", description: "Saved as draft. Click Publish to make it live on the ConcordiaCare app." });
      setFormData({ title: "", content: "", category: "general", authorName: "", authorDesignation: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create blog post", variant: "destructive" });
    },
  });

  const updateBlogMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { title: string; content: string; category?: string; imageUrl?: string | null; pinnedToHero?: boolean } }) => {
      const response = await apiRequest("PATCH", `/api/admin/blog/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Post updated", description: "Changes are now live on the ConcordiaCare app." });
      setEditingPost(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update blog post", variant: "destructive" });
    },
  });

  const publishBlogMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/blog/${id}/publish`);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Published!", description: "Post is now live on the ConcordiaCare app home screen." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to publish blog post", variant: "destructive" });
    },
  });

  const unpublishBlogMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/blog/${id}/unpublish`);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Unpublished", description: "Post removed from the ConcordiaCare app." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to unpublish blog post", variant: "destructive" });
    },
  });

  const deleteBlogMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/blog/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Blog post has been permanently removed." });
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete blog post", variant: "destructive" });
    },
  });

  const updateBlogImageMutation = useMutation({
    mutationFn: async ({ id, imageUrl }: { id: number; imageUrl: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/blog/${id}/image`, { imageUrl });
      return await response.json();
    },
    onError: (error: Error) => {
      toast({ title: "Image could not be attached", description: error.message, variant: "destructive" });
    },
  });

  const handleContentChange = useCallback((content: string) => {
    setFormData((prev) => ({ ...prev, content }));
  }, []);

  const handleEditContentChange = useCallback((content: string) => {
    setEditForm((prev) => ({ ...prev, content }));
  }, []);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum image size is 5MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setIsUploadingImage(true);
    try {
      const url = await uploadFile(file);
      setImageUrl(url);
      toast({ title: "Image uploaded", description: "Your blog image has been uploaded successfully." });
    } catch {
      toast({ title: "Upload failed", description: "Failed to upload image. Please try again.", variant: "destructive" });
      setImagePreview(null);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleEditImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum image size is 5MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setEditImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setIsEditUploadingImage(true);
    try {
      const url = await uploadFile(file);
      setEditImageUrl(url);
    } catch {
      toast({ title: "Upload failed", description: "Failed to upload image. Please try again.", variant: "destructive" });
      setEditImagePreview(null);
    } finally {
      setIsEditUploadingImage(false);
    }
  };

  const openEditDialog = (post: BlogPost) => {
    setEditingPost(post);
    setEditForm({ title: post.title, content: post.content, category: post.category ?? "general", pinnedToHero: post.pinnedToHero ?? false });
    setEditImagePreview(post.imageUrl ?? null);
    setEditImageUrl(post.imageUrl ?? null);
  };

  const handleSubmit = async (e: React.FormEvent, publish: boolean = false) => {
    e.preventDefault();
    if (!formData.title || !formData.content || !formData.authorName || !formData.authorDesignation) {
      toast({ title: "Missing Information", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    let postCreated = false;
    try {
      const created = await createBlogMutation.mutateAsync(formData);
      postCreated = Boolean(created?.id);
      if (created?.id) {
        if (imageUrl) await updateBlogImageMutation.mutateAsync({ id: created.id, imageUrl });
        if (publish) await publishBlogMutation.mutateAsync(created.id);
      }
      setImagePreview(null);
      setImageUrl(null);
    } catch {
      // Mutations show the specific failure. Avoid an unhandled rejection from the button handler.
      // A post may already have been created, so don't carry its image into a later post.
      if (postCreated) {
        setImagePreview(null);
        setImageUrl(null);
      }
    }
  };

  const handleEditSave = async () => {
    if (!editingPost) return;
    if (!editForm.title || !editForm.content) {
      toast({ title: "Missing Information", description: "Title and content are required.", variant: "destructive" });
      return;
    }
    try {
      await updateBlogMutation.mutateAsync({
        id: editingPost.id,
        data: { title: editForm.title, content: editForm.content, category: editForm.category, imageUrl: editImageUrl, pinnedToHero: editForm.pinnedToHero },
      });
    } catch {
      // The mutation's onError toast explains the failure; keep the edit dialog and values available.
    }
  };

  const pinnedCount = blogs.filter((p) => p.pinnedToHero).length;

  return (
    <AdminLayout backTo="/admin">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <h1 className="font-heading text-3xl font-bold">ConcordiaCare App: Blog Feed</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshFeedMutation.mutate()}
              disabled={refreshFeedMutation.isPending}
              data-testid="button-refresh-feed"
            >
              {refreshFeedMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Refreshing…</>
                : <><RefreshCw className="h-4 w-4 mr-2" />Refresh External Feed</>
              }
            </Button>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            <Smartphone className="h-4 w-4 shrink-0" />
            Posts you write here appear in the <strong>ConcordiaCare</strong> mobile app home screen.
            Only published posts are visible to patients. Posts expire after 3 weeks.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Create form ──────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Create New Post</CardTitle>
              <CardDescription>
                Write your content below. Add your name and designation so patients know who wrote it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="Enter blog title..."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    data-testid="input-blog-title"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Category
                  </Label>
                  <CategorySelector
                    value={formData.category}
                    onChange={(v) => setFormData({ ...formData, category: v })}
                    testId="select-category"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <RichTextEditor content={formData.content} onChange={handleContentChange} />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Cover Image (Optional)
                  </Label>
                  {imagePreview ? (
                    <div className="relative rounded-lg border overflow-hidden">
                      <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover" data-testid="img-blog-preview" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => { setImagePreview(null); setImageUrl(null); }}
                        disabled={isUploadingImage}
                        data-testid="button-remove-image"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {isUploadingImage && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col items-center justify-center py-4">
                        <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Click to upload an image</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} data-testid="input-blog-image" />
                    </label>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="authorName" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Your Name
                    </Label>
                    <Input
                      id="authorName"
                      placeholder="Dr. John Smith"
                      value={formData.authorName}
                      onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
                      data-testid="input-author-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authorDesignation" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Designation
                    </Label>
                    <Input
                      id="authorDesignation"
                      placeholder="Chief Pharmacist"
                      value={formData.authorDesignation}
                      onChange={(e) => setFormData({ ...formData, authorDesignation: e.target.value })}
                      data-testid="input-author-designation"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={createBlogMutation.isPending || publishBlogMutation.isPending}
                    onClick={(e) => handleSubmit(e as any, false)}
                    data-testid="button-save-draft"
                  >
                    {createBlogMutation.isPending && !publishBlogMutation.isPending ? "Saving draft..." : "Save as Draft"}
                  </Button>
                  <Button
                    type="button"
                    disabled={createBlogMutation.isPending || publishBlogMutation.isPending}
                    onClick={(e) => handleSubmit(e as any, true)}
                    data-testid="button-publish"
                  >
                    {publishBlogMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing...</>
                    ) : (
                      <><Send className="mr-2 h-4 w-4" />Publish to App</>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── Posts list ───────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Published */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-emerald-500" />
                  Live on App
                  {publishedBlogs.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{publishedBlogs.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  These posts are visible to patients on the ConcordiaCare home screen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
                ) : isError ? (
                  <p className="py-6 text-center text-sm text-destructive" role="alert">
                    Could not load blog posts. Refresh the page and try again.
                  </p>
                ) : publishedBlogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No live posts yet.</p>
                ) : (
                  <div className="space-y-3">
                    {publishedBlogs.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onEdit={() => openEditDialog(post)}
                        onPublish={() => publishBlogMutation.mutate(post.id)}
                        onUnpublish={() => unpublishBlogMutation.mutate(post.id)}
                        onDelete={() => setDeleteConfirmId(post.id)}
                        isPublishing={publishBlogMutation.isPending}
                        isUnpublishing={unpublishBlogMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Drafts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Drafts
                  {draftBlogs.length > 0 && (
                    <Badge variant="outline" className="ml-1">{draftBlogs.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Drafts are not visible to patients. Publish when ready.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-20" />
                ) : isError ? (
                  <p className="py-6 text-center text-sm text-destructive" role="alert">
                    Could not load blog posts. Refresh the page and try again.
                  </p>
                ) : draftBlogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No drafts.</p>
                ) : (
                  <div className="space-y-3">
                    {draftBlogs.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onEdit={() => openEditDialog(post)}
                        onPublish={() => publishBlogMutation.mutate(post.id)}
                        onUnpublish={() => unpublishBlogMutation.mutate(post.id)}
                        onDelete={() => setDeleteConfirmId(post.id)}
                        isPublishing={publishBlogMutation.isPending}
                        isUnpublishing={unpublishBlogMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Edit dialog ─────────────────────────────────── */}
      <Dialog open={!!editingPost} onOpenChange={(open) => { if (!open) setEditingPost(null); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-post">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                data-testid="input-edit-title"
              />
            </div>

            {/* Pin to hero toggle */}
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2 cursor-pointer" htmlFor="switch-pin-to-hero">
                  <Pin className="h-4 w-4 text-amber-500" />
                  Pin to blog hero
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pinned posts always appear first in the featured hero section (max 2).
                  {pinnedCount >= 2 && !editForm.pinnedToHero && (
                    <span className="text-amber-500 font-medium"> 2 posts already pinned. Unpin one first.</span>
                  )}
                </p>
              </div>
              <Switch
                id="switch-pin-to-hero"
                checked={editForm.pinnedToHero}
                disabled={pinnedCount >= 2 && !editForm.pinnedToHero}
                onCheckedChange={(checked) => setEditForm((p) => ({ ...p, pinnedToHero: checked }))}
                data-testid="switch-pin-to-hero"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Tag className="h-4 w-4" />Category</Label>
              <CategorySelector
                value={editForm.category}
                onChange={(v) => setEditForm((p) => ({ ...p, category: v }))}
                testId="select-edit-category"
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <RichTextEditor
                key={editingPost?.id}
                content={editForm.content}
                onChange={handleEditContentChange}
                placeholder="Edit post content..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Image className="h-4 w-4" />Cover Image</Label>
              {editImagePreview ? (
                <div className="relative rounded-lg border overflow-hidden">
                  <img src={editImagePreview} alt="Preview" className="w-full h-36 object-cover" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => { setEditImagePreview(null); setEditImageUrl(null); }}
                    disabled={isEditUploadingImage}
                    data-testid="button-edit-remove-image"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {isEditUploadingImage && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-6 w-6 mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Click to upload image</p>
                  <input type="file" accept="image/*" className="hidden" onChange={handleEditImageSelect} data-testid="input-edit-image" />
                </label>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingPost(null)} data-testid="button-edit-cancel">
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={updateBlogMutation.isPending} data-testid="button-edit-save">
              {updateBlogMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ───────────────────────── */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Delete Post?</DialogTitle>
            <DialogDescription>This will permanently remove the post. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId !== null && deleteBlogMutation.mutate(deleteConfirmId)}
              disabled={deleteBlogMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteBlogMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function PostCard({
  post,
  onEdit,
  onPublish,
  onUnpublish,
  onDelete,
  isPublishing,
  isUnpublishing,
}: {
  post: BlogPost;
  onEdit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  isPublishing: boolean;
  isUnpublishing: boolean;
}) {
  return (
    <div className="rounded-md border p-3 hover-elevate" data-testid={`blog-post-${post.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{post.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{post.content}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />{post.authorName}
            </span>
            {post.isPublished && post.publishedAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />{format(new Date(post.publishedAt), "MMM d")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3 text-red-500" />{post.likes}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            data-testid={`button-edit-${post.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {post.isPublished ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onUnpublish}
              disabled={isUnpublishing}
              data-testid={`button-unpublish-${post.id}`}
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={onPublish}
              disabled={isPublishing}
              data-testid={`button-publish-post-${post.id}`}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            data-testid={`button-delete-${post.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {post.isPublished ? (
          <Badge variant="default" className="text-[10px] flex items-center gap-1 w-fit">
            <Check className="h-3 w-3" />Live on App
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground w-fit">Draft</Badge>
        )}
        {post.pinnedToHero && (
          <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit text-amber-500">
            <Pin className="h-3 w-3" />Pinned to hero
          </Badge>
        )}
      </div>
    </div>
  );
}
