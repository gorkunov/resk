import { createContext, useContext, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DIFF_SCHEME, autoHighlightFile, isDiffUrl } from '../../shared/anchors.js';
import { useStore } from '../state/store.jsx';
import { Highlight } from './Highlight.jsx';

const InPre = createContext(false);

function urlTransform(url: string): string {
  return isDiffUrl(url) ? url : defaultUrlTransform(url);
}

function Link({ href, children }: { href?: string; children?: ReactNode }) {
  if (href && isDiffUrl(href)) return <Highlight raw={href}>{children}</Highlight>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Pre({ children }: { children?: ReactNode }) {
  return (
    <InPre.Provider value={true}>
      <pre>{children}</pre>
    </InPre.Provider>
  );
}

function Code({ children, className }: { children?: ReactNode; className?: string }) {
  const inPre = useContext(InPre);
  const { review } = useStore();
  const text = typeof children === 'string' ? children : undefined;
  if (!inPre && text !== undefined && autoHighlightFile(text, review.files)) {
    return (
      <Highlight raw={DIFF_SCHEME + text}>
        <code className={className}>{children}</code>
      </Highlight>
    );
  }
  return <code className={className}>{children}</code>;
}

const components: Components = { a: Link, code: Code, pre: Pre };

export function Markdown({ source }: { source: string }) {
  return (
    <div className="summary-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
