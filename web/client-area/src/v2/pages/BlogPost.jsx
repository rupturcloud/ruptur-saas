/**
 * BlogPost — artigo individual em /blog/:slug. Trilíngue (pt/en/es) via i18n.
 */
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useT, useI18n } from '../../i18n/index.jsx';
import { getPost } from './blog/posts.js';
import { PublicNav, PublicFooter, PUBLIC_CSS, fmtDate } from '../components/publicChrome.jsx';

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { lang } = useI18n();
  const post = getPost(slug);

  useEffect(() => {
    document.title = post
      ? `${post.title[lang] || post.title.pt} · Ruptur OS`
      : 'Blog · Ruptur OS';
  }, [post, lang]);

  return (
    <div className="pub">
      <style>{PUBLIC_CSS}</style>
      <PublicNav />
      <div className="pub-wrap">
        {!post ? (
          <div className="post">
            <h1>{t('blog.notFound')}</h1>
            <button className="post-back" onClick={() => navigate('/blog')}>{t('blog.back')}</button>
          </div>
        ) : (
          <article className="post">
            <div className="post-meta">
              <span className="blog-tag">{post.tag[lang] || post.tag.pt}</span>
              <span>{fmtDate(post.date, lang)}</span>
              <span>· {post.readMin} {t('blog.minRead')}</span>
            </div>
            <h1>{post.title[lang] || post.title.pt}</h1>
            {/* conteúdo próprio e estático — seguro renderizar como HTML */}
            <div
              className="post-body"
              dangerouslySetInnerHTML={{ __html: post.body[lang] || post.body.pt }}
            />
            <button className="post-back" onClick={() => navigate('/blog')}>{t('blog.back')}</button>
          </article>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
