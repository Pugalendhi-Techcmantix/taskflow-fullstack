import { toast } from './toast';

/** Copies the current address (filters, sort and page live in the URL), so the link opens the same view. */
export async function copyLink(what = 'this view') {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast(`Link copied · it opens ${what} with the same filters`);
  } catch {
    toast("Couldn't copy the link. Copy it from the address bar instead.", 'error');
  }
}
