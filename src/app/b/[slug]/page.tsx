import type { Metadata } from 'next';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PublicBusinessPageClient from './PublicBusinessPageClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await params;

    const q = query(
      collection(db, 'publicPages'),
      where('slug', '==', slug),
      where('isPublished', '==', true),
      limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      return {
        title: 'Business Page | RealQte',
        description: 'View this business page on RealQte.',
      };
    }

    const data = snap.docs[0].data();
    const businessName = data.businessSnapshot?.businessName || 'Business';
    const description =
      data.shortDescription || `View ${businessName}'s business page on RealQte.`;

    return {
      title: `${businessName} | RealQte`,
      description,
      alternates: {
        canonical: `https://realqte.com/b/${slug}`,
      },
      openGraph: {
        title: `${businessName} | RealQte`,
        description,
        url: `https://realqte.com/b/${slug}`,
        siteName: 'RealQte',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${businessName} | RealQte`,
        description,
      },
    };
  } catch (err) {
    console.error('Metadata error:', err);

    return {
      title: 'RealQte Business Page',
      description: 'View a business page on RealQte.',
    };
  }
}

export default function PublicBusinessPagePage() {
  return <PublicBusinessPageClient />;
}
