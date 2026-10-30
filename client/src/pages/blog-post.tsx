import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn } from "@/lib/queryClient";
import { format } from "date-fns";
import { Calendar, User, Briefcase, ArrowLeft, FileText, LinkIcon } from "lucide-react";
import { SiFacebook, SiX, SiLinkedin } from "react-icons/si";
import type { BlogPost } from "@shared/schema";

const SITE_URL = "https://concordianyc.com";

function ShareButtons({ title, slug }: { title: string; slug: string }) {
  const { toast } = useToast();
  const url = `${SITE_URL}/blog/${slug}`;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Post URL has been copied to your clipboard." });
    } catch {
      toast({ title: "Could not copy", description: "Please copy the URL from your browser's address bar.", variant: "destructive" });
    }
  };

  const channels = [
    {
      label: "Facebook",
      icon: SiFacebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: "text-slate-400 hover:text-[hsl(220 89% 53%)]",
      testId: "button-share-facebook",
    },
    {
      label: "X",
      icon: SiX,
      href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      color: "text-slate-400 hover:text-white",
      testId: "button-share-x",
    },
    {
      label: "LinkedIn",
      icon: SiLinkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      color: "text-slate-400 hover:text-[hsl(210 86% 40%)]",
      testId: "button-share-linkedin",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="share-buttons">
      <span className="text-xs text-slate-300 mr-1">Share</span>
      {channels.map((ch) => (
        <Button
          key={ch.label}
          variant="ghost"
          size="icon"
          className={ch.color}
          asChild
        >
          <a
            href={ch.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${ch.label}`}
            data-testid={ch.testId}
          >
            <ch.icon className="h-4 w-4" />
          </a>
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="text-slate-400 hover:text-cyan-400"
        onClick={copyLink}
        aria-label="Copy link"
        data-testid="button-share-copy"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function getExcerpt(content: string, maxLength = 160): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength).replace(/\s+\S*$/, "") + "...";
}

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: post, isLoading, error } = useQuery<BlogPost | null>({
    queryKey: ["/api/blog/posts", slug],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!slug,
  });

  const notFound = !isLoading && (!post || !!error);

  const { data: recentPosts } = useQuery<{ posts: BlogPost[] }>({
    queryKey: ["/api/blog/posts"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: notFound,
    staleTime: 60000,
  });

  return (
    <PageTransition>
      {post ? (
        <>
          <SEO
            title={post.title}
            description={getExcerpt(post.content)}
            image={post.imageUrl || undefined}
            path={`/blog/${post.slug || slug}`}
            type="article"
          />
          <Helmet>
            {/* Article author for social sharing previews */}
            <meta name="author" content={post.authorName} />
            <meta property="article:author" content={post.authorName} />
            {post.publishedAt && (
              <meta property="article:published_time" content={new Date(post.publishedAt).toISOString()} />
            )}
            <script type="application/ld+json">{JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              "headline": post.title,
              "image": post.imageUrl || "https://concordianyc.com/og-image.png",
              "datePublished": post.publishedAt ?? post.createdAt,
              "dateModified": post.updatedAt ?? post.publishedAt ?? post.createdAt,
              "description": getExcerpt(post.content),
              "url": `https://concordianyc.com/blog/${post.slug || slug}`,
              "author": {
                "@type": "Person",
                "name": post.authorName,
                "jobTitle": post.authorDesignation,
                "worksFor": {
                  "@type": "Organization",
                  "name": "Concordia Pharmacy",
                  "url": "https://concordianyc.com"
                }
              },
              "publisher": {
                "@type": "Organization",
                "name": "Concordia Pharmacy",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://concordianyc.com/concordia-icon.png"
                }
              }
            })}</script>
          </Helmet>
        </>
      ) : notFound ? (
        <SEO
          title="Blog Post Not Found"
          description="The requested Concordia Pharmacy blog post does not exist or is no longer available."
          noCanonical
          noIndex
        />
      ) : null}
      <Header />
      <main className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>
        <section className="pt-24 pb-24 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <Link href="/blog">
              <Button variant="ghost" className="mb-6 text-slate-400" data-testid="button-back-to-blog">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Blog
              </Button>
            </Link>

            {isLoading ? (
              <div className="space-y-6">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-64 w-full rounded-md" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : !post || error ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-16 w-16 text-slate-400 mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2" data-testid="text-post-not-found">
                  Post not found
                </h2>
                <p className="text-slate-400 mb-6">
                  {recentPosts?.posts && recentPosts.posts.length > 0
                    ? "This post may have expired or been removed. Here are some recent posts you might enjoy."
                    : "This blog post may have been removed or doesn't exist."}
                </p>
                <Link href="/blog">
                  <Button variant="outline" data-testid="button-browse-blog">
                    Browse all posts
                  </Button>
                </Link>

                {recentPosts?.posts && recentPosts.posts.length > 0 && (
                  <div className="mt-12 w-full text-left" data-testid="section-suggested-posts">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 text-center">
                      Recent Posts
                    </h3>
                    <div className="space-y-4">
                      {recentPosts.posts.slice(0, 3).map((suggestion) => (
                        <Link
                          key={suggestion.id}
                          href={`/blog/${suggestion.slug || suggestion.id}`}
                        >
                          <div
                            className="border border-white/10 rounded-md p-4 hover-elevate cursor-pointer bg-white/5"
                            data-testid={`card-suggested-post-${suggestion.id}`}
                          >
                            <h4 className="text-white font-medium mb-1">{suggestion.title}</h4>
                            <p className="text-slate-400 text-sm line-clamp-2">
                              {getExcerpt(suggestion.content, 120)}
                            </p>
                            {suggestion.publishedAt && (
                              <span className="text-xs text-slate-300 mt-2 inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(suggestion.publishedAt), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <article>
                <h1
                  className="font-heading text-3xl sm:text-4xl font-bold text-white mb-4"
                  data-testid="text-post-title"
                >
                  {post.title}
                </h1>

                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400 mb-8">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-1.5" data-testid="text-post-author">
                      <User className="h-4 w-4" />
                      {post.authorName}
                    </span>
                    <span className="flex items-center gap-1.5" data-testid="text-post-designation">
                      <Briefcase className="h-4 w-4" />
                      {post.authorDesignation}
                    </span>
                    {post.publishedAt && (
                      <span className="flex items-center gap-1.5" data-testid="text-post-date">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(post.publishedAt), "MMMM d, yyyy")}
                      </span>
                    )}
                  </div>
                  <ShareButtons title={post.title} slug={post.slug || String(post.id)} />
                </div>

                {post.imageUrl && (
                  <div className="mb-8 rounded-md overflow-hidden">
                    <img
                      src={post.imageUrl}
                      alt={post.title}
                      className="w-full max-h-[400px] object-cover"
                      data-testid="img-post-cover"
                    />
                  </div>
                )}

                <div
                  className="text-slate-300 leading-relaxed whitespace-pre-wrap text-base sm:text-lg"
                  data-testid="text-post-content"
                >
                  {post.content}
                </div>
              </article>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </PageTransition>
  );
}
