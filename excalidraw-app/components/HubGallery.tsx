// Irate-Box hub gallery: named saves on the hub's store.py (/api/saves), shared with the
// Mermaid editor's saves. Offline builds only -- the hub serves this app and the API on
// the same origin, so relative URLs need no configuration.
//
// Times come from the hub, not this browser: the store stamps `created` in powered-on
// seconds and every listing carries `now` on the same clock, so "saved 5 min ago" is
// right even though the board has no RTC.
import {
  exportToBlob,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import "./HubGallery.scss";

const SAVES_URL = "/api/saves";
const KIND = "excalidraw";
const THUMB_MAX_PX = 256;

type SaveMeta = {
  id: string;
  kind: string;
  name: string;
  created: number;
  thumb: boolean;
};

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const saveToHubGallery = async (api: ExcalidrawImperativeAPI) => {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();
  if (!elements.length) {
    api.setToast({ message: "Nothing to save yet." });
    return;
  }
  let thumb: string | undefined;
  try {
    const png = await exportToBlob({
      elements,
      appState: { ...appState, exportBackground: true },
      files,
      mimeType: "image/png",
      maxWidthOrHeight: THUMB_MAX_PX,
    });
    thumb = await blobToDataURL(png);
  } catch {
    // A save without a preview is still a save.
  }
  const state = JSON.parse(serializeAsJSON(elements, appState, files, "local"));
  try {
    const res = await fetch(SAVES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: KIND, name: api.getName(), state, thumb }),
    });
    if (!res.ok) {
      throw new Error(String(res.status));
    }
    api.setToast({ message: `Saved "${api.getName()}" to the hub gallery.` });
  } catch {
    api.setToast({
      message: "Could not save to the hub — it did not answer.",
      closable: true,
      duration: 6000,
    });
  }
};

const ago = (seconds: number) => {
  if (seconds < 90) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

const Thumb = ({ id }: { id: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    // The store serves thumbnails as opaque downloads (same-origin safety), so they
    // are fetched and re-typed rather than pointed at directly.
    fetch(`${SAVES_URL}/${id}/thumb`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) {
          url = URL.createObjectURL(new Blob([b], { type: "image/png" }));
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [id]);
  return src ? (
    <img className="HubGallery__thumb" src={src} alt="" />
  ) : (
    <div className="HubGallery__thumb" />
  );
};

export const HubGalleryDialog = ({
  api,
  onClose,
}: {
  api: ExcalidrawImperativeAPI;
  onClose: () => void;
}) => {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(SAVES_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { now: number; saves: SaveMeta[] }) => {
        setNow(data.now);
        setSaves(
          data.saves
            .filter((s) => s.kind === KIND)
            .sort((a, b) => b.created - a.created),
        );
      })
      .catch(() => setError("The hub did not answer."));
  }, []);

  const open = async (save: SaveMeta) => {
    try {
      const res = await fetch(`${SAVES_URL}/${save.id}`);
      if (!res.ok) {
        throw new Error(String(res.status));
      }
      const { state } = await res.json();
      const blob = new Blob([JSON.stringify(state)], {
        type: "application/vnd.excalidraw+json",
      });
      const scene = await loadFromBlob(blob, api.getAppState(), null);
      api.updateScene({
        elements: scene.elements,
        appState: { ...scene.appState, name: save.name },
      });
      if (scene.files) {
        api.addFiles(Object.values(scene.files));
      }
      if (scene.elements.length) {
        api.setViewport({
          target: scene.elements,
          fit: "scale-down",
          animation: false,
        });
      }
      onClose();
    } catch {
      setError(`Could not open "${save.name}".`);
    }
  };

  return (
    <Dialog size="regular" onCloseRequest={onClose} title="Hub gallery">
      <div className="HubGallery">
        {error && <p className="HubGallery__note">{error}</p>}
        {!error && saves === null && (
          <p className="HubGallery__note">Loading…</p>
        )}
        {saves?.length === 0 && (
          <p className="HubGallery__note">
            No drawings saved to the hub yet. Use “Save to hub gallery” in the
            menu.
          </p>
        )}
        {!!saves?.length && (
          <ul className="HubGallery__list">
            {saves.map((save) => (
              <li key={save.id}>
                <button
                  type="button"
                  className="HubGallery__item"
                  onClick={() => open(save)}
                >
                  {save.thumb ? (
                    <Thumb id={save.id} />
                  ) : (
                    <div className="HubGallery__thumb" />
                  )}
                  <span className="HubGallery__name">{save.name}</span>
                  <span className="HubGallery__time">
                    {ago(now - save.created)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
};
