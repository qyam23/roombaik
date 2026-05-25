const ACCESS_KEY_STORAGE = "roomsense_access_key";

export function getAccessKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get("access_key");
  if (urlKey) {
    window.localStorage.setItem(ACCESS_KEY_STORAGE, urlKey);
    params.delete("access_key");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
    return urlKey;
  }

  return window.localStorage.getItem(ACCESS_KEY_STORAGE) || "";
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const key = getAccessKey();
  const headers = new Headers(init.headers || {});
  if (key) headers.set("X-RoomSense-Key", key);

  return fetch(input, {
    ...init,
    headers
  });
}
