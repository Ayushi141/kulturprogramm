"""All sources, in the order of a run. Add a new source here and in its own module."""

from sources.filmkunstkinos import Filmkunstkinos
from sources.dhaus import Dhaus
from sources.oper_am_rhein import OperAmRhein
from sources.schauspiel_koeln import SchauspielKoeln
from sources.theater_krefeld_moenchengladbach import TheaterKrefeldMoenchengladbach
from sources.oper_wuppertal import OperWuppertal
from sources.theater_essen import TheaterEssen
from sources.oper_koeln import OperKoeln
from sources.schauspielhaus_bochum import SchauspielhausBochum
from sources.pina_bausch import PinaBausch
from sources.ufa_palast_duesseldorf import UfaPalastDuesseldorf
from sources.uci_kinowelt import UciKinowelt
from sources.filmmuseum_duesseldorf import FilmmuseumDuesseldorf
from sources.theater_dortmund import TheaterDortmund
from sources.tonhalle_duesseldorf import TonhalleDuesseldorf
from sources.koelner_philharmonie import KoelnerPhilharmonie
from sources.konzerthaus_dortmund import KonzerthausDortmund
from sources.rheinisches_landestheater import RheinischesLandestheater
from sources.musiktheater_im_revier import MusiktheaterImRevier
from sources.theater_oberhausen import TheaterOberhausen


# name (stored as productions.source), website, organizer (written to events; shown in full)
sources = [
    # each event names its cinema as organizer
    Filmkunstkinos("filmkunstkinos", "https://filmkunstkinos.de/programm/", None),
    Dhaus(
        "dhaus", "https://www.dhaus.de/programm/spielplan/schauspiel", "Düsseldorfer Schauspielhaus"
    ),
    OperAmRhein(
        "oper-am-rhein",
        "https://www.operamrhein.de/spielplan/kalender/",
        "Deutsche Oper am Rhein",
    ),
    SchauspielKoeln("schauspiel-koeln", "https://www.schauspiel.koeln/kalender", "Schauspiel Köln"),
    TheaterKrefeldMoenchengladbach(
        "theater-krefeld-moenchengladbach",
        "https://theater-kr-mg.de/kalender/",
        "Theater Krefeld und Mönchengladbach",
    ),
    OperWuppertal(
        "oper-wuppertal", "https://www.oper-wuppertal.de/", "Oper Wuppertal"
    ),
    TheaterEssen(
        "theater-essen", "https://www.theater-essen.de/programm/kalender/", "Theater und Philharmonie Essen"
    ),
    OperKoeln("oper-koeln", "https://www.oper.koeln/programm", "Oper Köln"),
    SchauspielhausBochum(
        "schauspielhaus-bochum",
        "https://www.schauspielhausbochum.de/de/spielplan/13/schauspiel",
        "Schauspielhaus Bochum",
    ),
    PinaBausch(
        "pina-bausch", "https://www.pina-bausch.de/de/calendar", "Tanztheater Wuppertal Pina Bausch"
    ),
    UfaPalastDuesseldorf(
        "ufa-palast-duesseldorf", "https://ufa-duesseldorf.de/programm/", "UFA Palast Düsseldorf"
    ),
    UciKinowelt(
        "uci-kinowelt",
        "https://www.uci-kinowelt.de/kinoprogramm/duesseldorf/50",
        "UCI Kinowelt Düsseldorf",
    ),
    FilmmuseumDuesseldorf(
        "filmmuseum-duesseldorf",
        "https://filmmuseum-duesseldorf.de/black-box-kino/kinoprogramm",
        "Filmmuseum Düsseldorf",
    ),
    TheaterDortmund("theater-dortmund", "https://www.theaterdo.de/kalender/", "Theater Dortmund"),
    TonhalleDuesseldorf("tonhalle-duesseldorf", "https://www.tonhalle.de/", "Tonhalle Düsseldorf"),
    KoelnerPhilharmonie(
        "koelner-philharmonie", "https://www.koelner-philharmonie.de/de/konzerte", "Kölner Philharmonie"
    ),
    KonzerthausDortmund(
        "konzerthaus-dortmund", "https://www.konzerthaus-dortmund.de/de/programm/", "Konzerthaus Dortmund"
    ),
    RheinischesLandestheater(
        "rheinisches-landestheater",
        "https://www.rheinisches-landestheater.de/spielplan/index.html",
        "Rheinisches Landestheater Neuss",
    ),
    MusiktheaterImRevier(
        "musiktheater-im-revier", "https://mirgelsenkirchen.de/kalender-tickets", "Musiktheater im Revier"
    ),
    TheaterOberhausen(
        "theater-oberhausen", "https://theater-oberhausen.de/programm/spielplan/", "Theater Oberhausen"
    ),
]
