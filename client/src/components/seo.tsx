import { Helmet } from "react-helmet-async";

const SITE_NAME = "Concordia Pharmacy";
const DEFAULT_DESCRIPTION = "Concordia Pharmacy offers a modern digital pharmacy experience with prescription refills, OTC shopping, specialty medications, free delivery, and loyalty rewards. Serving the Bronx and Manhattan since 1997.";
const DEFAULT_OG_IMAGE = "/og-image.png";
const SITE_URL = "https://concordianyc.com";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
  type?: "website" | "article";
  noCanonical?: boolean;
  noIndex?: boolean;
}

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_OG_IMAGE,
  path,
  type = "website",
  noCanonical = false,
  noIndex = false,
}: SEOProps) {
  const resolvedPath = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - Your Digital Healthcare Partner`;
  const canonicalUrl = `${SITE_URL}${resolvedPath}`;
  const imageUrl = image.startsWith("http") ? image : `${SITE_URL}${image}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {!noCanonical && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}
