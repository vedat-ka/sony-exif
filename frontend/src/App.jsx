import { useEffect, useRef, useState } from 'react';

const API_URL = 'http://localhost:8000/api/exif';

const ALL_GROUPS = 'Alle';

const FIELD_LABELS = {
  name: 'Dateiname',
  suffix: 'Dateiendung',
  content_type: 'MIME-Typ',
  size_bytes: 'Dateigroesse',
  created_at: 'Erstellt am',
  modified_at: 'Geaendert am',
  has_exif: 'EXIF vorhanden',
  tag_count: 'Sichtbare Tags',
  raw_tag_count: 'Originale Tags',
  hidden_binary_tag_count: 'Ausgeblendete Binaerdaten',
  metadata_source: 'Metadaten-Parser',
  camera_model: 'Kamera',
  lens_model: 'Objektiv',
  captured_at: 'Aufgenommen am',
  iso: 'ISO',
  shutter_count: 'Ausloesungen',
  shutter_count_source: 'Gefunden in',
};

function formatLabel(key) {
  return FIELD_LABELS[key] || key.replaceAll('_', ' ');
}

function getTagGroup(tagName) {
  const [group] = tagName.split(' ');
  return group || 'Sonstige';
}

function buildGroupedTags(exif = {}, query = '', activeGroup = ALL_GROUPS) {
  const normalizedQuery = query.trim().toLowerCase();

  return Object.entries(exif).reduce((groups, [key, value]) => {
    const group = getTagGroup(key);
    const serializedValue = formatValue(value);
    const matchesGroup = activeGroup === ALL_GROUPS || activeGroup === group;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      key.toLowerCase().includes(normalizedQuery) ||
      serializedValue.toLowerCase().includes(normalizedQuery);

    if (!matchesGroup || !matchesQuery) {
      return groups;
    }

    const currentItems = groups[group] ?? [];
    groups[group] = [...currentItems, [key, value]];
    return groups;
  }, {});
}

function formatValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'Ja' : 'Nein';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  if (value === 'exiftool') {
    return 'ExifTool';
  }

  if (value === 'exifread') {
    return 'ExifRead';
  }

  return String(value);
}

function getVisibleHighlightEntries(highlights) {
  if (!highlights) {
    return [];
  }

  return Object.entries(highlights).filter(([key, value]) => key !== 'shutter_count_note' && value !== null && value !== '');
}

function App() {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState(ALL_GROUPS);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const exifEntries = metadata ? Object.entries(metadata.exif) : [];
  const groups = [
    ALL_GROUPS,
    ...Array.from(new Set(exifEntries.map(([key]) => getTagGroup(key)))).sort((left, right) =>
      left.localeCompare(right)
    ),
  ];
  const groupedTags = buildGroupedTags(metadata?.exif, searchQuery, activeGroup);
  const visibleTagCount = Object.values(groupedTags).reduce((sum, items) => sum + items.length, 0);
  const highlightEntries = getVisibleHighlightEntries(metadata?.highlights);

  async function uploadFile(file) {
    setSelectedFile(file);
    setError('');
    setMetadata(null);
    setLoading(true);
    setSearchQuery('');
    setActiveGroup(ALL_GROUPS);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || 'Upload failed');
      }

      setMetadata(payload);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelection(fileList) {
    const file = fileList?.[0];
    if (file) {
      void uploadFile(file);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Sony EXIF Inspector</p>
          <h1>Bild hochladen und alle erkannten EXIF-Metadaten anzeigen</h1>
          <p className="hero-copy">
            Ziehe ein Bild per Drag-and-Drop hinein oder waehle eine Datei aus. Das Python-Backend
            liest die Metadaten aus und liefert sie direkt an das React-Frontend.
          </p>
        </div>

        <button className="secondary-button" onClick={() => inputRef.current?.click()}>
          Datei waehlen
        </button>
      </section>

      <section
        className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFileSelection(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => handleFileSelection(event.target.files)}
        />

        <p className="dropzone-title">Bild hier ablegen</p>
        <p className="dropzone-copy">Unterstuetzt: JPG, PNG, TIFF, WEBP, HEIC</p>
        <button className="primary-button" onClick={() => inputRef.current?.click()}>
          Upload starten
        </button>

        {selectedFile ? <p className="file-pill">Aktuelle Datei: {selectedFile.name}</p> : null}
      </section>

      {loading ? <section className="status-card">Metadaten werden gelesen ...</section> : null}
      {error ? <section className="status-card error-card">{error}</section> : null}

      {metadata ? (
        <section className="results-grid">
          <article className="card">
            <div className="card-header">
              <h2>Sony-Highlights</h2>
              <span>{formatValue(metadata.summary.metadata_source)}</span>
            </div>

            {highlightEntries.length > 0 ? (
              <dl className="key-value-list">
                {highlightEntries.map(([key, value]) => (
                  <div key={key} className="key-value-row">
                    <dt>{formatLabel(key)}</dt>
                    <dd>{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty-state">Keine hervorgehobenen Sony-Felder erkannt.</p>
            )}

            {metadata.highlights?.shutter_count_note ? (
              <p className="info-note">{metadata.highlights.shutter_count_note}</p>
            ) : null}
          </article>

          <article className="card preview-card">
            <div className="card-header">
              <h2>Vorschau</h2>
              {selectedFile ? <span>{selectedFile.type || 'image/*'}</span> : null}
            </div>

            {previewUrl ? (
              <div className="preview-frame">
                <img className="preview-image" src={previewUrl} alt="Hochgeladenes Bild" />
              </div>
            ) : (
              <p className="empty-state">Nach dem Upload erscheint hier die Bildvorschau.</p>
            )}
          </article>

          <article className="card">
            <h2>Datei</h2>
            <dl className="key-value-list">
              {Object.entries(metadata.file).map(([key, value]) => (
                <div key={key} className="key-value-row">
                  <dt>{formatLabel(key)}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="card">
            <h2>Zusammenfassung</h2>
            <dl className="key-value-list">
              {Object.entries(metadata.summary).map(([key, value]) => (
                <div key={key} className="key-value-row">
                  <dt>{formatLabel(key)}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="card card-wide">
            <div className="card-header">
              <h2>EXIF-Tags</h2>
              <span>
                {visibleTagCount} von {metadata.summary.tag_count} Eintraegen sichtbar
              </span>
            </div>

            {metadata.summary.hidden_binary_tag_count > 0 ? (
              <p className="info-note">
                {metadata.summary.hidden_binary_tag_count} Thumbnail- oder Preview-Bloecke wurden ausgeblendet,
                damit keine unlesbaren Binaerdaten in der Ansicht erscheinen.
              </p>
            ) : null}

            <div className="filter-toolbar">
              <label className="search-field" htmlFor="tag-search">
                <span>Suchen</span>
                <input
                  id="tag-search"
                  type="search"
                  value={searchQuery}
                  placeholder="z. B. Lens, ISO, DateTime, GPS"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>

              <div className="group-filter-list" aria-label="EXIF-Gruppen filtern">
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={`filter-chip ${activeGroup === group ? 'filter-chip-active' : ''}`}
                    onClick={() => setActiveGroup(group)}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>

            {Object.keys(metadata.exif).length === 0 ? (
              <p className="empty-state">In der Datei wurden keine EXIF-Tags gefunden.</p>
            ) : visibleTagCount === 0 ? (
              <p className="empty-state">Keine EXIF-Tags passen auf den aktuellen Suchbegriff oder Filter.</p>
            ) : (
              <div className="group-stack dense-list">
                {Object.entries(groupedTags).map(([groupName, items]) => (
                  <section key={groupName} className="tag-group">
                    <div className="tag-group-header">
                      <h3>{groupName}</h3>
                      <span>{items.length} Tags</span>
                    </div>

                    <dl className="key-value-list">
                      {items.map(([key, value]) => (
                        <div key={key} className="key-value-row">
                          <dt>{key}</dt>
                          <dd>{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}

export default App;
