import {useEffect, useMemo, useRef, useState} from 'react';

const encodePath = v => v.replaceAll('\\', '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');

function baseUrl(rel) {
    const n = rel.replaceAll('\\', '/'), i = n.lastIndexOf('/'), d = i >= 0 ? n.slice(0, i + 1) : '', e = encodePath(d);
    return e ? `note-resource://local/${e}/` : 'note-resource://local/';
}

function prepare(html, rel) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,iframe,object,embed').forEach(n => n.remove());
    d.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach(n => n.remove());
    d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
        /^on/i.test(a.name) && n.removeAttribute(a.name);
        ['src', 'href', 'xlink:href'].includes(a.name.toLowerCase()) && /^javascript:/i.test(a.value.trim()) && n.removeAttribute(a.name)
    }));
    let b = d.querySelector('base');
    if (!b) {
        b = d.createElement('base');
        d.head.prepend(b)
    }
    b.href = baseUrl(rel);
    const c = d.createElement('meta');
    c.httpEquiv = 'Content-Security-Policy';
    c.content = "default-src 'none'; img-src note-resource: data: https: http:; style-src 'unsafe-inline' note-resource: https: http:; font-src note-resource: data: https: http:; media-src note-resource: data: https: http:";
    d.head.prepend(c);
    return '<!doctype html>' + d.documentElement.outerHTML;
}

export default function App() {
    const [root, setRoot] = useState(''), [q, setQ] = useState(''), [notes, setNotes] = useState([]), [selected, setSelected] = useState(null), [html, setHtml] = useState(''), [status, setStatus] = useState('쪽지 경로를 선택하세요.'), [loading, setLoading] = useState(false),
        frame = useRef();

    async function load(v = q) {
        setLoading(true);
        try {
            const r = await window.noteApi.listAllNotes(v);
            setNotes(r.items);
            setStatus(`${r.total}개의 HTML 쪽지를 찾았습니다.`)
        } catch (e) {
            setStatus(e.message)
        } finally {
            setLoading(false)
        }
    }

    async function choose() {
        const r = await window.noteApi.chooseRoot();
        if (!r.canceled) {
            setRoot(r.root);
            setSelected(null);
            setHtml('');
            await load(q)
        }
    }

    async function save() {
        try {
            const r = await window.noteApi.setRoot(root);
            setRoot(r.root);
            setSelected(null);
            setHtml('');
            await load(q)
        } catch (e) {
            setStatus(e.message)
        }
    }

    async function open(n) {
        try {
            const r = await window.noteApi.readNote(n.relativePath);
            setSelected(n);
            setHtml(prepare(r.html, r.relativePath))
        } catch (e) {
            setStatus(e.message)
        }
    }

    function bind() {
        const d = frame.current?.contentDocument;
        if (!d || !selected) return;
        d.addEventListener('click', async e => {
            const a = e.target.closest?.('a[href]');
            if (!a) return;
            const h = a.getAttribute('href');
            if (!h || h.startsWith('#') || h.startsWith('data:') || h.startsWith('blob:')) return;
            e.preventDefault();
            try {
                await window.noteApi.openFile({href: h, noteRelativePath: selected.relativePath})
            } catch (err) {
                setStatus(err.message)
            }
        }, true)
    }

    useEffect(() => {
        (async () => {
            const r = await window.noteApi.getRoot();
            if (r.root) {
                setRoot(r.root);
                await load('')
            }
        })()
    }, []);
    useEffect(() => {
        const t = setTimeout(() => root && load(q), 250);
        return () => clearTimeout(t)
    }, [q]);
    const title = useMemo(() => selected?.title || '쪽지를 선택하세요.', [selected]);
    return <main className="app">
        <header className="header">
            <div><h1>Easy Note Viewer</h1><p>로컬 이미지와 스타일을 포함한 HTML 쪽지를 확인합니다.</p></div>
            <button onClick={choose}>폴더 선택</button>
        </header>
        <section className="pathBar"><input value={root} onChange={e => setRoot(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && save()} placeholder="쪽지 폴더 경로"/>
            <button onClick={save}>경로 저장</button>
        </section>
        <div className="status">{status}</div>
        <section className="workspace">
            <aside className="sidebar">
                <div className="toolbar"><input className="search" value={q} onChange={e => setQ(e.target.value)}
                                                placeholder="제목, 파일명, 경로 검색"/>
                    <div>{loading ? '불러오는 중...' : `검색 결과 ${notes.length}개`}</div>
                </div>
                <div className="list">{notes.map(n => <button key={n.id}
                                                              className={selected?.id === n.id ? 'active' : ''}
                                                              onClick={() => open(n)}>
                    <strong>{n.title}</strong><span>{n.relativePath}</span></button>)}</div>
            </aside>
            <section className="preview">
                <div className="previewHeader"><strong>{title}</strong>{selected &&
                    <span>{selected.relativePath}</span>}</div>
                <div className="previewBody">{selected ?
                    <iframe ref={frame} title={selected.title} srcDoc={html} onLoad={bind}
                            sandbox="allow-same-origin"/> : <div className="empty">목록에서 쪽지를 선택하세요.</div>}</div>
            </section>
        </section>
    </main>
}
