/**
 * Blog — índice público em /blog. Trilíngue (pt/en/es) via i18n.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useI18n } from '../../i18n/index.jsx';
import { POSTS } from './blog/posts.js';
import { PublicNav, PublicFooter, PUBLIC_CSS, fmtDate } from '../components/publicChrome.jsx';

export default function Blog() {
  const navigate = useNavigate();
  const t = useT();
  const { lang } = useI18n();

  useEffect(() => { document.title = 'Blog · Ruptur OS'; }, []);

  return (
    <div className="pub">
      <style>{PUBLIC_CSS}</style>
      <PublicNav />
      <div className="pub-wrap">
        <header className="blog-head">
          <h1>{t('blog.title')}</h1>
          <p>{t('blog.subtitle')}</p>
        </header>
        <div className="blog-grid">
          {POSTS.map((post) => (
            <button
              key={post.slug}
              className="blog-card"
              onClick={() => navigate('/blog/' + post.slug)}
            >
              <span className="blog-card-cover">{post.cover}</span>
              <span className="blog-tag">{post.tag[lang] || post.tag.pt}</span>
              <h3>{post.title[lang] || post.title.pt}</h3>
              <p>{post.excerpt[lang] || post.excerpt.pt}</p>
              <span className="blog-card-meta">
                {fmtDate(post.date, lang)} · {post.readMin} {t('blog.minRead')}
              </span>
            </button>
          ))}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
