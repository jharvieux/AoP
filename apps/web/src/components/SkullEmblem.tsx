/**
 * Skull-and-crossbones emblem for the title screen (#311).
 *
 * Artwork: "Jolly Roger 2" from Wikimedia Commons / the Open Clip Art Library,
 * released under Creative Commons CC0 1.0 (public domain, no attribution required):
 * https://commons.wikimedia.org/wiki/File:Jolly_Roger_2.svg
 *
 * Adapted for the launch screen: black flag background removed, cropped and centred
 * on the skull-and-crossbones, and recoloured to the Weathered Parchment palette
 * (--skull-bone #ece0c0 / --skull-socket #1a1006). Served as a static asset from
 * `public/art/ui/` rather than inlined, so its detailed vector path stays out of the
 * JS bundle (the #253 asset-size budget) — same convention as the other `/art` assets.
 */
export function SkullEmblem({ className }: { className?: string }) {
  return <img className={className} src="/art/ui/skull-emblem.svg" alt="" aria-hidden="true" />
}
