import type { ReactNode } from 'react'
import type { Lang } from './i18n'

/**
 * The legal pages: the imprint (Impressum, required by § 5 DDG) and the privacy policy
 * (Datenschutzerklärung, required by Art. 13 GDPR). Their texts are here, not in i18n.ts,
 * because they are long and change only when the operator or the data processing changes.
 * Keep both languages in step; the German text is the binding one.
 */
export { LEGAL_PATH, type LegalPage } from './legal-path'

/** The operator of the site, as the imprint and the privacy policy name them. */
const OPERATOR = {
  name: 'Polina Pavlova',
  street: 'Münsterstraße 40',
  city: '40476 Düsseldorf',
  email: 'kontakt@kulturprogramm.eu',
}

const Address = () => (
  <p>
    {OPERATOR.name}<br />{OPERATOR.street}<br />{OPERATOR.city}
  </p>
)
const Mail = () => <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>

type Section = { title: string; body: ReactNode }
type Content = { title: string; updated?: string; sections: Section[] }

/** The imprint; the contact form follows its "Kontakt" section on the page. */
export function imprint(lang: Lang): Content {
  if (lang === 'en')
    return {
      title: 'Imprint',
      sections: [
        { title: 'Information under § 5 DDG', body: <Address /> },
        { title: 'Contact', body: <p>Email: <Mail /><br />Or use the form below.</p> },
        {
          title: 'Responsible for the content under § 18 (2) MStV',
          body: <p>{OPERATOR.name}, address as above.</p>,
        },
        {
          title: 'Programme data and images',
          body: <p>Titles, dates and images come from the websites of the venues and belong to them. For tickets and binding information, the venue&apos;s own page applies. The context notes are researched and written by an AI and can be wrong.</p>,
        },
      ],
    }
  return {
    title: 'Impressum',
    sections: [
      { title: 'Angaben gemäß § 5 DDG', body: <Address /> },
      { title: 'Kontakt', body: <p>E-Mail: <Mail /><br />Oder über das Formular unten.</p> },
      {
        title: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
        body: <p>{OPERATOR.name}, Anschrift wie oben.</p>,
      },
      {
        title: 'Programmdaten und Bilder',
        body: <p>Titel, Termine und Bilder stammen von den Websites der Spielstätten und gehören ihnen. Für Tickets und verbindliche Angaben gilt die Seite der jeweiligen Spielstätte. Die Kontext-Texte recherchiert und schreibt eine KI; sie können Fehler enthalten.</p>,
      },
    ],
  }
}

/** The privacy policy. Update it whenever the site starts to process data in a new way. */
export function privacy(lang: Lang): Content {
  if (lang === 'en')
    return {
      title: 'Privacy policy',
      updated: 'As of November 2026',
      sections: [
        { title: 'Who is responsible', body: <><Address /><p>Email: <Mail /></p></> },
        {
          title: 'In short',
          body: <p>This site sets no cookies and uses no advertising services. We count visits with our own statistics, without cookies and without storing your IP address. Fonts, images and statistics run on our own server, so your browser does not contact third parties when it shows the site. We store personal data about you only when you send us a message.</p>,
        },
        {
          title: 'Hosting and page requests',
          body: <>
            <p>The site runs on a server rented from Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany, which processes the data on our behalf (Art. 28 GDPR).</p>
            <p>When you open a page, your browser sends technical data that is needed to deliver it: your IP address, the time, the requested address and the name of your browser. The server uses these data to answer the request and does not store them in an access log. Legal basis: Art. 6 (1) (f) GDPR; our legitimate interest is to deliver the site securely.</p>
          </>,
        },
        {
          title: 'Visitor statistics (Umami)',
          body: <p>To see which pages people read, we count page views with Umami, open-source software that runs on our own server. With each page view your browser sends us the page, the page you came from, your browser, operating system, device type, screen size and language. From your IP address Umami derives country, region and city, and forms an identifier from these data so that several page views count as one visit; it does not store the IP address itself. Umami sets no cookies, and the data go to no one else. If your browser sends a “Do Not Track” signal, we do not count you. Legal basis: Art. 6 (1) (f) GDPR; our legitimate interest is to understand how the site is used and to improve it.</p>,
        },
        {
          title: 'Session recordings and heatmaps (Umami)',
          body: <p>For a part of the visits, Umami also records how the site is used: how the page changes, mouse movements, taps, clicks and scrolling. From this we can replay a visit and see, summed over many visits, where people click and how far they scroll. We use it to find what does not work in the interface. Input fields are hidden in the recording, so what you type does not reach us. The recording ends after a few minutes at the latest; recordings are deleted after 30 days. If your browser sends a “Do Not Track” signal, we record nothing. Legal basis: Art. 6 (1) (f) GDPR; our legitimate interest is to find and fix problems in the site.</p>,
        },
        {
          title: '“My evening” in your browser',
          body: <p>The performances that you pick are saved only in your browser (local storage). They are not sent to us. You can delete them in the site or in your browser&apos;s settings. This storage is strictly necessary for the function that you use (§ 25 (2) no. 2 TDDDG).</p>,
        },
        {
          title: 'Contact form and email',
          body: <p>When you send a message, we store it with the name and email address that you enter, to answer it. Legal basis: Art. 6 (1) (f) GDPR, or Art. 6 (1) (b) GDPR if your message concerns a contract. We delete the message when your request is settled, at the latest after six months.</p>,
        },
        {
          title: 'Links to venues and sharing',
          body: <p>Links to venues and ticket shops open their websites; their own privacy policies apply there. If you share a performance, your device&apos;s share function sends the link; we receive no data about it.</p>,
        },
        {
          title: 'Your rights',
          body: <p>You have the right to access, rectification, erasure, restriction of processing, data portability and to object to processing that is based on Art. 6 (1) (f) GDPR (Art. 15–21 GDPR). Write to the address above. You can also complain to a data protection authority, for example the Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2–4, 40213 Düsseldorf.</p>,
        },
      ],
    }
  return {
    title: 'Datenschutzerklärung',
    updated: 'Stand: November 2026',
    sections: [
      { title: 'Verantwortlich', body: <><Address /><p>E-Mail: <Mail /></p></> },
      {
        title: 'Kurz gesagt',
        body: <p>Diese Website setzt keine Cookies und nutzt keine Werbedienste. Besuche zählen wir mit einer eigenen Statistik, ohne Cookies und ohne deine IP-Adresse zu speichern. Schriften, Bilder und Statistik laufen über unseren eigenen Server; dein Browser nimmt beim Anzeigen der Seite keinen Kontakt zu Dritten auf. Personenbezogene Daten über dich speichern wir nur, wenn du uns eine Nachricht schickst.</p>,
      },
      {
        title: 'Hosting und Seitenaufrufe',
        body: <>
          <p>Die Website läuft auf einem gemieteten Server der Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, die die Daten in unserem Auftrag verarbeitet (Art. 28 DSGVO).</p>
          <p>Wenn du eine Seite aufrufst, sendet dein Browser technische Daten, die für die Auslieferung nötig sind: deine IP-Adresse, den Zeitpunkt, die aufgerufene Adresse und die Kennung deines Browsers. Der Server nutzt diese Daten, um die Anfrage zu beantworten, und speichert sie nicht in einem Zugriffsprotokoll. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist die sichere Auslieferung der Website.</p>
        </>,
      },
      {
        title: 'Besucherstatistik (Umami)',
        body: <p>Um zu sehen, welche Seiten gelesen werden, zählen wir Seitenaufrufe mit Umami, einer Open-Source-Software auf unserem eigenen Server. Bei jedem Seitenaufruf sendet dein Browser uns die aufgerufene Seite, die Seite, von der du kommst, Browser, Betriebssystem, Gerätetyp, Bildschirmgröße und Sprache. Aus deiner IP-Adresse leitet Umami Land, Region und Stadt ab und bildet aus diesen Angaben eine Kennung, damit mehrere Aufrufe als ein Besuch zählen; die IP-Adresse selbst speichert es nicht. Umami setzt keine Cookies, und die Daten gehen an niemanden weiter. Sendet dein Browser das Signal „Do Not Track“, zählen wir dich nicht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist, zu verstehen, wie die Website genutzt wird, und sie zu verbessern.</p>,
      },
      {
        title: 'Sitzungsaufzeichnungen und Heatmaps (Umami)',
        body: <p>Bei einem Teil der Besuche zeichnet Umami zusätzlich auf, wie die Seite genutzt wird: wie sich die Seite verändert, Mausbewegungen, Tippen, Klicks und Scrollen. Daraus können wir einen Besuch nachspielen und, über viele Besuche zusammengefasst, sehen, wo geklickt und wie weit gescrollt wird. Wir nutzen das, um zu finden, was in der Bedienung hakt. Eingabefelder sind in der Aufzeichnung verdeckt; was du eintippst, erreicht uns also nicht. Eine Aufzeichnung endet spätestens nach wenigen Minuten; nach 30 Tagen wird sie gelöscht. Sendet dein Browser das Signal „Do Not Track“, zeichnen wir nichts auf. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist, Fehler auf der Website zu finden und zu beheben.</p>,
      },
      {
        title: '„Mein Abend“ in deinem Browser',
        body: <p>Die Vorstellungen, die du dir merkst, speichert nur dein Browser (Local Storage). Sie werden nicht an uns übertragen. Du kannst sie auf der Seite oder in den Einstellungen deines Browsers löschen. Diese Speicherung ist für die Funktion, die du nutzt, unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).</p>,
      },
      {
        title: 'Kontaktformular und E-Mail',
        body: <p>Wenn du uns eine Nachricht schickst, speichern wir sie mit dem Namen und der E-Mail-Adresse, die du angibst, um sie zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, bei Anfragen zu einem Vertrag Art. 6 Abs. 1 lit. b DSGVO. Wir löschen die Nachricht, wenn dein Anliegen erledigt ist, spätestens nach sechs Monaten.</p>,
      },
      {
        title: 'Links zu Spielstätten und Teilen',
        body: <p>Links zu Spielstätten und Ticketshops öffnen deren Websites; dort gelten deren Datenschutzerklärungen. Wenn du eine Vorstellung teilst, verschickt die Teilen-Funktion deines Geräts den Link; wir erhalten darüber keine Daten.</p>,
      },
      {
        title: 'Deine Rechte',
        body: <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und auf Widerspruch gegen Verarbeitungen nach Art. 6 Abs. 1 lit. f DSGVO (Art. 15–21 DSGVO). Schreib uns dazu an die Adresse oben. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2–4, 40213 Düsseldorf.</p>,
      },
    ],
  }
}
