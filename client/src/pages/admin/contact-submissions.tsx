import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminSidebar } from "@/components/admin-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, Mail, MessageSquare, Phone, Search } from "lucide-react";

type ContactSubmission = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "new" | "resolved";
  createdAt: string;
};

export default function AdminContactSubmissions() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const { data: submissions = [], isLoading } = useQuery<ContactSubmission[]>({
    queryKey: ["/api/admin/contact-submissions"],
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: ContactSubmission["status"] }) => {
      const response = await apiRequest("PATCH", `/api/admin/contact-submissions/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contact-submissions"] });
      toast({ title: "Submission updated" });
    },
    onError: (error: Error) => toast({
      title: "Failed to update submission",
      description: error.message || "Please try again.",
      variant: "destructive",
    }),
  });

  const filtered = submissions.filter((submission) => {
    const query = search.trim().toLowerCase();
    return !query || [submission.name, submission.email, submission.phone ?? "", submission.message]
      .some((value) => value.toLowerCase().includes(query));
  });
  const newCount = submissions.filter((submission) => submission.status === "new").length;

  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <div className="p-4 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-contact-submissions-title">
                <MessageSquare className="h-6 w-6 text-primary" />
                Contact Submissions
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Messages submitted through the public contact form.</p>
            </div>
            <Badge variant="secondary">{newCount} new</Badge>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inbox</CardTitle>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email, phone, or message" data-testid="input-search-contact-submissions" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading submissions…</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No contact submissions found.</div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((submission) => {
                    const resolved = submission.status === "resolved";
                    return (
                      <article key={submission.id} className="rounded-md border p-4 space-y-3" data-testid={`contact-submission-${submission.id}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="font-semibold">{submission.name}</h2>
                              <Badge variant={resolved ? "secondary" : "default"}>
                                {resolved ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                                {resolved ? "Resolved" : "New"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Submitted {new Date(submission.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Button size="sm" variant={resolved ? "outline" : "default"}
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: submission.id, status: resolved ? "new" : "resolved" })}
                            data-testid={`button-toggle-contact-status-${submission.id}`}>
                            {resolved ? "Reopen" : "Mark resolved"}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <a className="flex items-center gap-1 hover:text-foreground" href={`mailto:${submission.email}`}><Mail className="h-3.5 w-3.5" />{submission.email}</a>
                          {submission.phone && <a className="flex items-center gap-1 hover:text-foreground" href={`tel:${submission.phone}`}><Phone className="h-3.5 w-3.5" />{submission.phone}</a>}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{submission.message}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}