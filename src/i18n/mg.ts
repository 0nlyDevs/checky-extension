// Malagasy. Machine-drafted from fr.ts: every line below is to be reread by a Malagasy speaker
// before release (`// relire (mg)`). Any key missing here falls back to French (index.ts). The
// verdict words match the web desk and the SMS line (fanilo-base).
import type { Overrides } from "./index.ts";

// relire (mg)
export const mg: Overrides = {
  title: "Hamarino eto.", // relire (mg)
  lead: "Porofo hanamarinana izay vakianao, tsy mila miala amin'ny pejy.", // relire (mg)
  menuText: "Hamarino amin'i Checky ity lahatsoratra ity", // relire (mg)
  menuImage: "Dinihina amin'i Checky ity sary ity", // relire (mg)
  menuLink: "Hamarino amin'i Checky ity rohy ity", // relire (mg)
  open: "Sokafy i Checky", // relire (mg)
  settings: {
    title: "Fikirana", // relire (mg)
    language: "Fiteny ampiasaina", // relire (mg)
  },
  modes: { text: "Lahatsoratra", link: "Rohy", image: "Sary" }, // relire (mg)
  input: "Ilay filazana hohamarinina", // relire (mg)
  url: "Rohy hodinihina", // relire (mg)
  chooseImage: "Misafidiana sary", // relire (mg)
  removeImage: "Esory", // relire (mg)
  clear: "Fafao", // relire (mg)
  page: "Pejy niaviany", // relire (mg)
  privacyTitle: "Izay alefa, sy ho an'iza", // relire (mg)
  publicMode: "Azo ampiasaina tsy misy kaonty", // relire (mg)
  newsroomMode: "Ny gazetiko", // relire (mg)
  continuePublic: "Hanohy tsy misy kaonty", // relire (mg)
  analyze: "Hamarino ity votoaty ity", // relire (mg)
  inspect: "Dinihina ny sary", // relire (mg)
  cancel: "Ajanony ny famakafakana", // relire (mg)
  busy: "Eo am-pamakafakana…", // relire (mg)
  steps: ["Ilay filazana", "Ireo porofo", "Ny fehin-kevitra"], // relire (mg)
  publicSteps: ["Ilay lahatsoratra", "Ireo fikarohana", "Ireo loharano novakiana"], // relire (mg)
  verdicts: { true: "Marina", misleading: "Mamitaka", false: "Diso", unverifiable: "Tsy voamarina" }, // relire (mg)
  sources: "Loharano hita", // relire (mg)
  publicEmpty: "Tsy nisy didy navoaka hita", // relire (mg)
  readPublished: "Vakio feno ny fanamarinana", // relire (mg)
  track: "Arahina ao amin'ny gazetiko", // relire (mg)
  openClaim: "Sokafy ny antontan-taratasy", // relire (mg)
  errors: {
    network: "Tsy tratra i Checky. Jereo ny fifandraisana; mety haharitra iray minitra vao mifoha ny tolotra.", // relire (mg)
    rateLimit: "Be loatra ny famakafakana nifanesy. Andramo indray afaka minitra vitsivitsy.", // relire (mg)
    unavailable: "Tsy azo ampiasaina vetivety ny tolotra famakafakana. Andramo indray any aoriana.", // relire (mg)
    failed: "Tsy vita ny famakafakana. Andramo amin'ny andalana fohy kokoa na loharano hafa.", // relire (mg)
  },
  footer: "Manolotra ny IA. Ny mpanao gazety no manapa-kevitra.", // relire (mg)
};
