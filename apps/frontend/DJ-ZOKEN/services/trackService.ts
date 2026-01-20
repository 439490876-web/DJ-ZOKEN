import { Track, MusicalKey, ITrackService, SetList } from '../types';

// Helper: Genre Grouping Logic (Shared)
export const getGenreCategory = (genre: string | null = ''): string => {
    const g = (genre || '').toLowerCase();
    if (!g) return 'Other';
    
    if (g.includes('house') || g.includes('minimal') || g.includes('acid') || g === 'progressive' || g.includes('disco')) return 'House / Disco';
    if (g.includes('techno')) return 'Techno';
    if (g.includes('trance') || g.includes('psytrance')) return 'Trance';
    if (g.includes('hip hop') || g.includes('rap') || g.includes('trap') || g.includes('r&b') || g.includes('afrobeat') || g.includes('dancehall')) return 'Hip Hop / R&B';
    if (g.includes('dnb') || g.includes('drum & bass') || g.includes('dubstep') || g.includes('bass') || g.includes('ukg') || g.includes('garage')) return 'Bass / DnB';
    if (g.includes('latin') || g.includes('reggaeton') || g.includes('moombahton')) return 'Latin';
    if (g.includes('rock') || g.includes('grunge') || g.includes('metal') || g.includes('punk') || g.includes('indie')) return 'Rock / Alt';
    if (g.includes('jazz') || g.includes('lo-fi') || g.includes('ambient') || g.includes('lounge') || g.includes('trip hop') || g.includes('downtempo')) return 'Chill / Jazz';
    if (g.includes('big room') || g.includes('hardstyle') || g.includes('hardcore') || g.includes('festival')) return 'Hard / Festival';
    if (g.includes('pop') || g.includes('k-pop') || g.includes('dance')) return 'Pop / Dance';
    if (g.includes('tool') || g.includes('fx') || g.includes('sample') || g.includes('loop') || g.includes('acapella')) return 'Tools';
    
    return 'Other';
};

// Mock Data - Expanded with diverse genres
const MOCK_LIBRARY: Track[] = [
  // --- EXISTING TRACKS (Preserved) ---
  // --- EDM / House ---
  { id: '1', title: 'Midnight City', artist: 'M83', bpm: 105, key: '6A', energy: 8, resonance: 9, genre: 'Synthpop', duration: '04:03', coverUrl: 'https://picsum.photos/100/100?random=1' },
  { id: '2', title: 'One More Time', artist: 'Daft Punk', bpm: 123, key: '10A', energy: 9, resonance: 10, genre: 'House', duration: '05:20', coverUrl: 'https://picsum.photos/100/100?random=2' },
  { id: '3', title: 'Levels', artist: 'Avicii', bpm: 126, key: '6B', energy: 10, resonance: 10, genre: 'Progressive House', duration: '05:38', coverUrl: 'https://picsum.photos/100/100?random=4' },
  { id: '4', title: 'Titanium', artist: 'David Guetta', bpm: 126, key: '5B', energy: 9, resonance: 9, genre: 'Dance Pop', duration: '04:05', coverUrl: 'https://picsum.photos/100/100?random=6' },
  { id: '5', title: 'Clarity', artist: 'Zedd', bpm: 128, key: '8B', energy: 8, resonance: 8, genre: 'Electro House', duration: '04:31', coverUrl: 'https://picsum.photos/100/100?random=8' },
  { id: '6', title: 'Sandstorm', artist: 'Darude', bpm: 136, key: '4A', energy: 10, resonance: 10, genre: 'Trance', duration: '07:26', coverUrl: 'https://picsum.photos/100/100?random=12' },
  
  // --- Hip Hop / Rap / Trap ---
  { id: '13', title: 'SICKO MODE', artist: 'Travis Scott', bpm: 155, key: '10A', energy: 9, resonance: 9, genre: 'Hip Hop', duration: '05:12', coverUrl: 'https://picsum.photos/100/100?random=13' },
  { id: '14', title: 'God\'s Plan', artist: 'Drake', bpm: 77, key: '11B', energy: 6, resonance: 9, genre: 'Hip Hop', duration: '03:18', coverUrl: 'https://picsum.photos/100/100?random=14' },
  { id: '15', title: 'HUMBLE.', artist: 'Kendrick Lamar', bpm: 150, key: '1A', energy: 8, resonance: 8, genre: 'Hip Hop', duration: '02:57', coverUrl: 'https://picsum.photos/100/100?random=15' },
  { id: '16', title: 'In Da Club', artist: '50 Cent', bpm: 90, key: '6A', energy: 7, resonance: 10, genre: 'Hip Hop', duration: '03:13', coverUrl: 'https://picsum.photos/100/100?random=16' },

  // --- Pop / Funk / R&B ---
  { id: '17', title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', bpm: 115, key: '10A', energy: 9, resonance: 10, genre: 'Funk', duration: '04:30', coverUrl: 'https://picsum.photos/100/100?random=17' },
  { id: '18', title: 'Levitating', artist: 'Dua Lipa', bpm: 103, key: '10A', energy: 8, resonance: 9, genre: 'Pop', duration: '03:23', coverUrl: 'https://picsum.photos/100/100?random=18' },
  { id: '19', title: 'Blinding Lights', artist: 'The Weeknd', bpm: 171, key: '5A', energy: 9, resonance: 10, genre: 'Synthwave', duration: '03:20', coverUrl: 'https://picsum.photos/100/100?random=19' },
  { id: '20', title: 'Billie Jean', artist: 'Michael Jackson', bpm: 117, key: '11A', energy: 7, resonance: 10, genre: 'Pop', duration: '04:54', coverUrl: 'https://picsum.photos/100/100?random=20' },

  // --- Rock / Alternative ---
  { id: '21', title: 'Smells Like Teen Spirit', artist: 'Nirvana', bpm: 117, key: '5A', energy: 9, resonance: 10, genre: 'Grunge', duration: '05:01', coverUrl: 'https://picsum.photos/100/100?random=21' },
  { id: '22', title: 'Seven Nation Army', artist: 'The White Stripes', bpm: 124, key: '9A', energy: 8, resonance: 9, genre: 'Rock', duration: '03:51', coverUrl: 'https://picsum.photos/100/100?random=22' },
  { id: '23', title: 'Mr. Brightside', artist: 'The Killers', bpm: 148, key: '2B', energy: 10, resonance: 8, genre: 'Rock', duration: '03:42', coverUrl: 'https://picsum.photos/100/100?random=23' },

  // --- Latin / Reggaeton ---
  { id: '24', title: 'Dákiti', artist: 'Bad Bunny', bpm: 110, key: '9A', energy: 7, resonance: 8, genre: 'Reggaeton', duration: '03:25', coverUrl: 'https://picsum.photos/100/100?random=24' },
  { id: '25', title: 'Despacito', artist: 'Luis Fonsi', bpm: 89, key: '10A', energy: 7, resonance: 10, genre: 'Latin Pop', duration: '03:48', coverUrl: 'https://picsum.photos/100/100?random=25' },
  
  // --- Low Resonance / Deep Cuts / Tools ---
  { id: '101', title: 'Berlin Tool 04', artist: 'Unknown Artist', bpm: 126, key: '4A', energy: 6, resonance: 2, genre: 'Techno', duration: '05:30', coverUrl: 'https://picsum.photos/100/100?random=101' },
  { id: '102', title: 'Deep Sea', artist: 'Oceanic', bpm: 122, key: '8A', energy: 5, resonance: 3, genre: 'Deep House', duration: '06:15', coverUrl: 'https://picsum.photos/100/100?random=102' },
  { id: '103', title: 'Minimal Groove', artist: 'Rominimal', bpm: 124, key: '11B', energy: 5, resonance: 2, genre: 'Minimal', duration: '07:00', coverUrl: 'https://picsum.photos/100/100?random=103' },
  { id: '104', title: 'Acid Rain', artist: '303 Boys', bpm: 130, key: '3A', energy: 7, resonance: 4, genre: 'Acid', duration: '05:45', coverUrl: 'https://picsum.photos/100/100?random=104' },
  { id: '105', title: 'Drum Track A', artist: 'Percussionist', bpm: 125, key: '2A', energy: 6, resonance: 1, genre: 'Tool', duration: '04:00', coverUrl: 'https://picsum.photos/100/100?random=105' },
  { id: '106', title: 'Vocal Loop', artist: 'Sampler', bpm: 128, key: '9B', energy: 4, resonance: 2, genre: 'Tool', duration: '02:30', coverUrl: 'https://picsum.photos/100/100?random=106' },

  // --- PREVIOUSLY ADDED (50 Tracks) ---
  // Tech House / Modern House
  { id: '201', title: 'Losing It', artist: 'FISHER', bpm: 125, key: '2A', energy: 9, resonance: 9, genre: 'Tech House', duration: '04:08', coverUrl: 'https://picsum.photos/100/100?random=201' },
  { id: '202', title: 'Take It', artist: 'Dom Dolla', bpm: 123, key: '7A', energy: 8, resonance: 8, genre: 'Tech House', duration: '03:54', coverUrl: 'https://picsum.photos/100/100?random=202' },
  { id: '203', title: 'Turn On The Lights again..', artist: 'Fred again..', bpm: 132, key: '9A', energy: 8, resonance: 9, genre: 'House', duration: '04:28', coverUrl: 'https://picsum.photos/100/100?random=203' },
  { id: '204', title: 'Cola', artist: 'CamelPhat & Elderbrook', bpm: 122, key: '8A', energy: 7, resonance: 8, genre: 'Deep House', duration: '06:56', coverUrl: 'https://picsum.photos/100/100?random=204' },
  { id: '205', title: '(It Goes Like) Nanana', artist: 'Peggy Gou', bpm: 130, key: '9B', energy: 7, resonance: 9, genre: 'House', duration: '03:51', coverUrl: 'https://picsum.photos/100/100?random=205' },
  { id: '206', title: 'Drugs From Amsterdam', artist: 'Mau P', bpm: 125, key: '10A', energy: 8, resonance: 8, genre: 'Tech House', duration: '03:49', coverUrl: 'https://picsum.photos/100/100?random=206' },
  { id: '207', title: 'Piece Of Your Heart', artist: 'Meduza', bpm: 124, key: '10A', energy: 7, resonance: 9, genre: 'Deep House', duration: '02:33', coverUrl: 'https://picsum.photos/100/100?random=207' },
  { id: '208', title: 'Atmosphere', artist: 'FISHER x Kita Alexander', bpm: 126, key: '8A', energy: 8, resonance: 8, genre: 'Tech House', duration: '03:10', coverUrl: 'https://picsum.photos/100/100?random=208' },
  // Melodic / Progressive
  { id: '209', title: 'Opus', artist: 'Eric Prydz', bpm: 126, key: '3A', energy: 9, resonance: 9, genre: 'Progressive', duration: '09:03', coverUrl: 'https://picsum.photos/100/100?random=209' },
  { id: '210', title: 'Your Mind', artist: 'Adam Beyer', bpm: 126, key: '7B', energy: 8, resonance: 7, genre: 'Techno', duration: '08:23', coverUrl: 'https://picsum.photos/100/100?random=210' },
  { id: '211', title: 'The Age Of Love (Charlotte de Witte Rmx)', bpm: 130, key: '5A', energy: 9, resonance: 8, genre: 'Techno', duration: '06:47', artist: 'Age Of Love', coverUrl: 'https://picsum.photos/100/100?random=211' },
  { id: '212', title: 'Space Date', artist: 'Adam Beyer & Layton Giordani', bpm: 127, key: '5B', energy: 8, resonance: 6, genre: 'Techno', duration: '06:36', coverUrl: 'https://picsum.photos/100/100?random=212' },
  { id: '213', title: 'Consciousness', artist: 'Anyma & Chris Avantgarde', bpm: 126, key: '5A', energy: 8, resonance: 7, genre: 'Melodic Techno', duration: '05:48', coverUrl: 'https://picsum.photos/100/100?random=213' },
  // Disco / Funk
  { id: '214', title: 'Don\'t Start Now', artist: 'Dua Lipa', bpm: 124, key: '11A', energy: 8, resonance: 10, genre: 'Nu-Disco', duration: '03:03', coverUrl: 'https://picsum.photos/100/100?random=214' },
  { id: '215', title: 'Gimme! Gimme! Gimme!', artist: 'ABBA', bpm: 120, key: '2A', energy: 7, resonance: 10, genre: 'Disco', duration: '04:48', coverUrl: 'https://picsum.photos/100/100?random=215' },
  { id: '216', title: 'September', artist: 'Earth, Wind & Fire', bpm: 126, key: '9B', energy: 8, resonance: 10, genre: 'Funk', duration: '03:35', coverUrl: 'https://picsum.photos/100/100?random=216' },
  { id: '217', title: 'I Feel Love', artist: 'Donna Summer', bpm: 128, key: '8B', energy: 7, resonance: 9, genre: 'Disco', duration: '05:53', coverUrl: 'https://picsum.photos/100/100?random=217' },
  { id: '218', title: 'Get Lucky', artist: 'Daft Punk', bpm: 116, key: '11A', energy: 6, resonance: 10, genre: 'Disco', duration: '06:09', coverUrl: 'https://picsum.photos/100/100?random=218' },
  { id: '219', title: 'About Damn Time', artist: 'Lizzo', bpm: 109, key: '4A', energy: 7, resonance: 9, genre: 'Pop/Disco', duration: '03:11', coverUrl: 'https://picsum.photos/100/100?random=219' },
  // Hip Hop / R&B
  { id: '220', title: 'Hotline Bling', artist: 'Drake', bpm: 135, key: '2A', energy: 5, resonance: 9, genre: 'R&B', duration: '04:27', coverUrl: 'https://picsum.photos/100/100?random=220' },
  { id: '221', title: 'California Love', artist: '2Pac', bpm: 92, key: '10B', energy: 8, resonance: 10, genre: 'Hip Hop', duration: '04:45', coverUrl: 'https://picsum.photos/100/100?random=221' },
  { id: '222', title: 'Gold Digger', artist: 'Kanye West', bpm: 93, key: '1A', energy: 8, resonance: 9, genre: 'Hip Hop', duration: '03:27', coverUrl: 'https://picsum.photos/100/100?random=222' },
  { id: '223', title: 'Bodak Yellow', artist: 'Cardi B', bpm: 125, key: '11B', energy: 8, resonance: 9, genre: 'Hip Hop/Trap', duration: '03:43', coverUrl: 'https://picsum.photos/100/100?random=223' },
  { id: '224', title: 'No Diggity', artist: 'Blackstreet', bpm: 89, key: '1A', energy: 5, resonance: 10, genre: 'R&B', duration: '05:04', coverUrl: 'https://picsum.photos/100/100?random=224' },
  { id: '225', title: 'Hey Ya!', artist: 'OutKast', bpm: 160, key: '10B', energy: 9, resonance: 10, genre: 'Hip Hop', duration: '03:55', coverUrl: 'https://picsum.photos/100/100?random=225' },
  { id: '226', title: 'Yeah!', artist: 'Usher', bpm: 105, key: '7A', energy: 9, resonance: 10, genre: 'R&B', duration: '04:10', coverUrl: 'https://picsum.photos/100/100?random=226' },
  // Afro / Chill
  { id: '227', title: 'Jerusalema', artist: 'Master KG', bpm: 124, key: '4B', energy: 6, resonance: 8, genre: 'Afro House', duration: '05:42', coverUrl: 'https://picsum.photos/100/100?random=227' },
  { id: '228', title: 'Water', artist: 'Tyla', bpm: 117, key: '2A', energy: 5, resonance: 9, genre: 'Afrobeat', duration: '03:20', coverUrl: 'https://picsum.photos/100/100?random=228' },
  { id: '229', title: 'Cold Heart (PNAU Remix)', artist: 'Elton John & Dua Lipa', bpm: 116, key: '4A', energy: 6, resonance: 9, genre: 'Pop', duration: '03:22', coverUrl: 'https://picsum.photos/100/100?random=229' },
  { id: '230', title: 'Passionfruit', artist: 'Drake', bpm: 112, key: '11B', energy: 5, resonance: 8, genre: 'Dancehall', duration: '04:58', coverUrl: 'https://picsum.photos/100/100?random=230' },
  // DnB / Dubstep
  { id: '231', title: 'Bangarang', artist: 'Skrillex', bpm: 110, key: '8A', energy: 10, resonance: 9, genre: 'Dubstep', duration: '03:35', coverUrl: 'https://picsum.photos/100/100?random=231' },
  { id: '232', title: 'I Remember', artist: 'deadmau5 & Kaskade', bpm: 128, key: '11A', energy: 6, resonance: 8, genre: 'Progressive', duration: '09:07', coverUrl: 'https://picsum.photos/100/100?random=232' },
  { id: '233', title: 'Afterglow', artist: 'Wilkinson', bpm: 174, key: '10A', energy: 9, resonance: 8, genre: 'DnB', duration: '03:45', coverUrl: 'https://picsum.photos/100/100?random=233' },
  { id: '234', title: 'Solar System', artist: 'Sub Focus', bpm: 174, key: '4A', energy: 9, resonance: 7, genre: 'DnB', duration: '04:48', coverUrl: 'https://picsum.photos/100/100?random=234' },
  { id: '235', title: 'Baddadan', artist: 'Chase & Status', bpm: 174, key: '4A', energy: 10, resonance: 9, genre: 'DnB', duration: '04:02', coverUrl: 'https://picsum.photos/100/100?random=235' },
  { id: '236', title: 'Rumble', artist: 'Skrillex & Fred again..', bpm: 140, key: '1A', energy: 9, resonance: 9, genre: 'Bass', duration: '02:26', coverUrl: 'https://picsum.photos/100/100?random=236' },
  // Rock
  { id: '237', title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', bpm: 125, key: '2B', energy: 8, resonance: 10, genre: 'Rock', duration: '05:56', coverUrl: 'https://picsum.photos/100/100?random=237' },
  { id: '238', title: 'Wonderwall', artist: 'Oasis', bpm: 87, key: '2A', energy: 5, resonance: 10, genre: 'Rock', duration: '04:18', coverUrl: 'https://picsum.photos/100/100?random=238' },
  { id: '239', title: 'Bohemian Rhapsody', artist: 'Queen', bpm: 71, key: '10B', energy: 6, resonance: 10, genre: 'Rock', duration: '05:55', coverUrl: 'https://picsum.photos/100/100?random=239' },
  { id: '240', title: 'Sex on Fire', artist: 'Kings of Leon', bpm: 153, key: '9A', energy: 9, resonance: 9, genre: 'Rock', duration: '03:23', coverUrl: 'https://picsum.photos/100/100?random=240' },
  // Tools
  { id: '241', title: 'Acappella Loop 01', artist: 'DJ Tool', bpm: 128, key: '10A', energy: 4, resonance: 1, genre: 'Tool', duration: '01:00', coverUrl: 'https://picsum.photos/100/100?random=241' },
  { id: '242', title: 'Tech Groove B', artist: 'Ghost Producer', bpm: 126, key: '5A', energy: 7, resonance: 2, genre: 'Tech House', duration: '04:30', coverUrl: 'https://picsum.photos/100/100?random=242' },
  { id: '243', title: 'Deep Texture', artist: 'Ambient Mode', bpm: 120, key: '1A', energy: 3, resonance: 1, genre: 'Deep House', duration: '05:00', coverUrl: 'https://picsum.photos/100/100?random=243' },
  { id: '244', title: 'Drum Break 909', artist: 'Rhythm', bpm: 125, key: '1B', energy: 6, resonance: 1, genre: 'Tool', duration: '02:00', coverUrl: 'https://picsum.photos/100/100?random=244' },
  { id: '245', title: 'White Noise Riser', artist: 'FX', bpm: 128, key: '12A', energy: 5, resonance: 1, genre: 'FX', duration: '00:30', coverUrl: 'https://picsum.photos/100/100?random=245' },
  // Bridges
  { id: '246', title: 'Crazy', artist: 'Gnarls Barkley', bpm: 112, key: '10A', energy: 7, resonance: 10, genre: 'Pop', duration: '03:00', coverUrl: 'https://picsum.photos/100/100?random=246' },
  { id: '247', title: 'Get Ur Freak On', artist: 'Missy Elliott', bpm: 178, key: '6A', energy: 8, resonance: 9, genre: 'Hip Hop', duration: '03:31', coverUrl: 'https://picsum.photos/100/100?random=247' },
  { id: '248', title: 'Hips Don\'t Lie', artist: 'Shakira', bpm: 100, key: '10B', energy: 7, resonance: 10, genre: 'Latin', duration: '03:38', coverUrl: 'https://picsum.photos/100/100?random=248' },
  { id: '249', title: 'Everybody (Backstreet\'s Back)', artist: 'Backstreet Boys', bpm: 108, key: '10A', energy: 7, resonance: 10, genre: 'Pop', duration: '03:44', coverUrl: 'https://picsum.photos/100/100?random=249' },
  { id: '250', title: 'Toxic', artist: 'Britney Spears', bpm: 143, key: '10A', energy: 8, resonance: 10, genre: 'Pop', duration: '03:18', coverUrl: 'https://picsum.photos/100/100?random=250' },

  // --- NEW ADDITIONS (Round 2 - 50 Tracks) ---
  
  // Trance / Psytrance (High Energy)
  { id: '301', title: 'Adagio For Strings', artist: 'Tiësto', bpm: 140, key: '4A', energy: 10, resonance: 10, genre: 'Trance', duration: '07:23', coverUrl: 'https://picsum.photos/100/100?random=301' },
  { id: '302', title: 'Exploration of Space', artist: 'Cosmic Gate', bpm: 138, key: '2A', energy: 9, resonance: 9, genre: 'Trance', duration: '08:20', coverUrl: 'https://picsum.photos/100/100?random=302' },
  { id: '303', title: 'Great Spirit', artist: 'Armin van Buuren vs Vini Vici', bpm: 138, key: '9A', energy: 10, resonance: 8, genre: 'Psytrance', duration: '03:36', coverUrl: 'https://picsum.photos/100/100?random=303' },
  { id: '304', title: 'Free Tibet', artist: 'Vini Vici', bpm: 138, key: '2A', energy: 9, resonance: 7, genre: 'Psytrance', duration: '07:35', coverUrl: 'https://picsum.photos/100/100?random=304' },
  { id: '305', title: 'Children', artist: 'Robert Miles', bpm: 138, key: '6A', energy: 6, resonance: 10, genre: 'Trance', duration: '07:30', coverUrl: 'https://picsum.photos/100/100?random=305' },

  // Big Room / Hardstyle / Festival
  { id: '306', title: 'Tsunami', artist: 'DVBBS & Borgeous', bpm: 128, key: '4A', energy: 10, resonance: 9, genre: 'Big Room', duration: '03:57', coverUrl: 'https://picsum.photos/100/100?random=306' },
  { id: '307', title: 'Animals', artist: 'Martin Garrix', bpm: 128, key: '4A', energy: 9, resonance: 10, genre: 'Big Room', duration: '05:04', coverUrl: 'https://picsum.photos/100/100?random=307' },
  { id: '308', title: 'Spaceman', artist: 'Hardwell', bpm: 128, key: '2A', energy: 9, resonance: 9, genre: 'Big Room', duration: '03:00', coverUrl: 'https://picsum.photos/100/100?random=308' },
  { id: '309', title: 'Zombie', artist: 'Ran-D', bpm: 170, key: '2A', energy: 10, resonance: 9, genre: 'Hardstyle', duration: '04:50', coverUrl: 'https://picsum.photos/100/100?random=309' },
  { id: '310', title: 'FTS', artist: 'Showtek', bpm: 150, key: '9A', energy: 10, resonance: 8, genre: 'Hardstyle', duration: '05:40', coverUrl: 'https://picsum.photos/100/100?random=310' },

  // C-Pop / Asian Pop (Resonance 9-10 for local crowds)
  { id: '311', title: 'Super Star', artist: 'S.H.E', bpm: 130, key: '10A', energy: 8, resonance: 10, genre: 'Pop', duration: '03:15', coverUrl: 'https://picsum.photos/100/100?random=311' },
  { id: '312', title: 'Fly Away', artist: 'F.I.R.', bpm: 130, key: '5A', energy: 8, resonance: 9, genre: 'Pop Rock', duration: '04:36', coverUrl: 'https://picsum.photos/100/100?random=312' },
  { id: '313', title: '第一天 (First Day)', artist: 'Sun Yanzi', bpm: 148, key: '8B', energy: 8, resonance: 9, genre: 'Pop Punk', duration: '04:12', coverUrl: 'https://picsum.photos/100/100?random=313' },
  { id: '314', title: '离开地球表面 (Jump!)', artist: 'Mayday', bpm: 172, key: '5B', energy: 10, resonance: 10, genre: 'Rock', duration: '04:36', coverUrl: 'https://picsum.photos/100/100?random=314' },
  { id: '315', title: '本草纲目', artist: 'Jay Chou', bpm: 104, key: '2A', energy: 7, resonance: 10, genre: 'Pop', duration: '03:29', coverUrl: 'https://picsum.photos/100/100?random=315' },

  // Jazz / Lo-fi / Lounge (Warmup - Resonance 4-6)
  { id: '316', title: 'Take Five', artist: 'Dave Brubeck', bpm: 174, key: '2A', energy: 4, resonance: 8, genre: 'Jazz', duration: '05:24', coverUrl: 'https://picsum.photos/100/100?random=316' }, // 5/4 time, tricky mix!
  { id: '317', title: 'So What', artist: 'Miles Davis', bpm: 138, key: '10A', energy: 3, resonance: 9, genre: 'Jazz', duration: '09:22', coverUrl: 'https://picsum.photos/100/100?random=317' },
  { id: '318', title: 'Lofi Beat 01', artist: 'Chillhop', bpm: 85, key: '5A', energy: 3, resonance: 3, genre: 'Lo-fi', duration: '02:30', coverUrl: 'https://picsum.photos/100/100?random=318' },
  { id: '319', title: 'Coffee Shop Vibes', artist: 'Unknown', bpm: 90, key: '8A', energy: 3, resonance: 2, genre: 'Lo-fi', duration: '03:00', coverUrl: 'https://picsum.photos/100/100?random=319' },
  { id: '320', title: 'Sunday Morning', artist: 'Maroon 5', bpm: 88, key: '8B', energy: 5, resonance: 9, genre: 'Pop', duration: '04:04', coverUrl: 'https://picsum.photos/100/100?random=320' },

  // 00s Hip Hop / Party
  { id: '321', title: 'Low', artist: 'Flo Rida', bpm: 128, key: '5A', energy: 8, resonance: 10, genre: 'Hip Hop', duration: '03:50', coverUrl: 'https://picsum.photos/100/100?random=321' },
  { id: '322', title: 'Party Rock Anthem', artist: 'LMFAO', bpm: 130, key: '2A', energy: 9, resonance: 10, genre: 'Electro Pop', duration: '04:22', coverUrl: 'https://picsum.photos/100/100?random=322' },
  { id: '323', title: 'Timber', artist: 'Pitbull & Ke$ha', bpm: 130, key: '12B', energy: 8, resonance: 9, genre: 'Pop', duration: '03:24', coverUrl: 'https://picsum.photos/100/100?random=323' },
  { id: '324', title: 'I Gotta Feeling', artist: 'Black Eyed Peas', bpm: 128, key: '8B', energy: 8, resonance: 10, genre: 'Pop', duration: '04:49', coverUrl: 'https://picsum.photos/100/100?random=324' },
  { id: '325', title: 'Starships', artist: 'Nicki Minaj', bpm: 125, key: '10B', energy: 8, resonance: 9, genre: 'Pop', duration: '03:30', coverUrl: 'https://picsum.photos/100/100?random=325' },

  // UK Garage / 2-Step
  { id: '326', title: 'Rewind', artist: 'Craig David', bpm: 130, key: '4A', energy: 7, resonance: 8, genre: 'UKG', duration: '05:33', coverUrl: 'https://picsum.photos/100/100?random=326' },
  { id: '327', title: 'Flowers', artist: 'Sweet Female Attitude', bpm: 130, key: '9A', energy: 7, resonance: 8, genre: 'UKG', duration: '03:50', coverUrl: 'https://picsum.photos/100/100?random=327' },
  { id: '328', title: 'Gotta Get Thru This', artist: 'Daniel Bedingfield', bpm: 132, key: '10A', energy: 7, resonance: 7, genre: 'UKG', duration: '02:45', coverUrl: 'https://picsum.photos/100/100?random=328' },

  // More Rock / Alternative
  { id: '329', title: 'Numb', artist: 'Linkin Park', bpm: 110, key: '2A', energy: 8, resonance: 10, genre: 'Rock', duration: '03:07', coverUrl: 'https://picsum.photos/100/100?random=329' },
  { id: '330', title: 'Bring Me To Life', artist: 'Evanescence', bpm: 95, key: '1A', energy: 8, resonance: 9, genre: 'Rock', duration: '03:57', coverUrl: 'https://picsum.photos/100/100?random=330' },
  
  // Latin / Reggaeton 2
  { id: '331', title: 'Pepas', artist: 'Farruko', bpm: 130, key: '8A', energy: 9, resonance: 9, genre: 'Latin', duration: '04:47', coverUrl: 'https://picsum.photos/100/100?random=331' },
  { id: '332', title: 'Tití Me Preguntó', artist: 'Bad Bunny', bpm: 107, key: '4A', energy: 7, resonance: 9, genre: 'Reggaeton', duration: '04:03', coverUrl: 'https://picsum.photos/100/100?random=332' },
  { id: '333', title: 'Gasolina', artist: 'Daddy Yankee', bpm: 96, key: '5A', energy: 8, resonance: 10, genre: 'Reggaeton', duration: '03:12', coverUrl: 'https://picsum.photos/100/100?random=333' },

  // More Tools / Beats
  { id: '334', title: 'House Beat 124', artist: 'Loop', bpm: 124, key: '1A', energy: 5, resonance: 1, genre: 'Tool', duration: '01:00', coverUrl: 'https://picsum.photos/100/100?random=334' },
  { id: '335', title: 'Build Up FX', artist: 'Tool', bpm: 128, key: '1A', energy: 9, resonance: 1, genre: 'FX', duration: '00:15', coverUrl: 'https://picsum.photos/100/100?random=335' },
  { id: '336', title: 'Sirens', artist: 'Tool', bpm: 0, key: '1A', energy: 8, resonance: 1, genre: 'Sample', duration: '00:10', coverUrl: 'https://picsum.photos/100/100?random=336' },
  
  // K-Pop
  { id: '337', title: 'Dynamite', artist: 'BTS', bpm: 114, key: '4A', energy: 7, resonance: 10, genre: 'K-Pop', duration: '03:19', coverUrl: 'https://picsum.photos/100/100?random=337' },
  { id: '338', title: 'How You Like That', artist: 'BLACKPINK', bpm: 130, key: '9A', energy: 8, resonance: 10, genre: 'K-Pop', duration: '03:00', coverUrl: 'https://picsum.photos/100/100?random=338' },
  { id: '339', title: 'Gangnam Style', artist: 'PSY', bpm: 132, key: '9A', energy: 9, resonance: 10, genre: 'K-Pop', duration: '03:39', coverUrl: 'https://picsum.photos/100/100?random=339' },

  // Ambient / Closing
  { id: '340', title: 'Porcelain', artist: 'Moby', bpm: 95, key: '5B', energy: 3, resonance: 8, genre: 'Ambient', duration: '04:01', coverUrl: 'https://picsum.photos/100/100?random=340' },
  { id: '341', title: 'Teardrop', artist: 'Massive Attack', bpm: 77, key: '2A', energy: 3, resonance: 8, genre: 'Trip Hop', duration: '05:30', coverUrl: 'https://picsum.photos/100/100?random=341' },
  
  // Mixed
  { id: '342', title: 'Bailando', artist: 'Enrique Iglesias', bpm: 91, key: '12B', energy: 6, resonance: 9, genre: 'Latin', duration: '04:03', coverUrl: 'https://picsum.photos/100/100?random=342' },
  { id: '343', title: 'Firework', artist: 'Katy Perry', bpm: 124, key: '8B', energy: 8, resonance: 10, genre: 'Pop', duration: '03:47', coverUrl: 'https://picsum.photos/100/100?random=343' },
  { id: '344', title: 'Moves Like Jagger', artist: 'Maroon 5', bpm: 128, key: '9A', energy: 8, resonance: 10, genre: 'Pop', duration: '03:21', coverUrl: 'https://picsum.photos/100/100?random=344' },
  { id: '345', title: 'We Found Love', artist: 'Rihanna', bpm: 128, key: '3A', energy: 9, resonance: 10, genre: 'Pop', duration: '03:35', coverUrl: 'https://picsum.photos/100/100?random=345' },
  { id: '346', title: 'Sorry', artist: 'Justin Bieber', bpm: 100, key: '5A', energy: 6, resonance: 10, genre: 'Pop', duration: '03:20', coverUrl: 'https://picsum.photos/100/100?random=346' },
  { id: '347', title: 'Shape of You', artist: 'Ed Sheeran', bpm: 96, key: '2A', energy: 6, resonance: 10, genre: 'Pop', duration: '03:53', coverUrl: 'https://picsum.photos/100/100?random=347' },
  { id: '348', title: 'Cheap Thrills', artist: 'Sia', bpm: 90, key: '11A', energy: 7, resonance: 9, genre: 'Pop', duration: '03:31', coverUrl: 'https://picsum.photos/100/100?random=348' },
  { id: '349', title: 'Lean On', artist: 'Major Lazer', bpm: 98, key: '11B', energy: 7, resonance: 9, genre: 'Dance', duration: '02:56', coverUrl: 'https://picsum.photos/100/100?random=349' },
  { id: '350', title: 'Faded', artist: 'Alan Walker', bpm: 90, key: '11A', energy: 5, resonance: 10, genre: 'EDM', duration: '03:32', coverUrl: 'https://picsum.photos/100/100?random=350' },

  // --- NEW BATCH 100 (ID 400+) ---
  
  // House / Tech House / Disco House (20 Tracks)
  { id: '401', title: 'Rhyme Dust', artist: 'MK & Dom Dolla', bpm: 128, key: '1A', energy: 8, resonance: 9, genre: 'Tech House', duration: '03:12', coverUrl: 'https://picsum.photos/100/100?random=401' },
  { id: '402', title: 'Miracle Maker', artist: 'Dom Dolla', bpm: 128, key: '9B', energy: 9, resonance: 8, genre: 'Tech House', duration: '03:00', coverUrl: 'https://picsum.photos/100/100?random=402' },
  { id: '403', title: 'Baddest Of Them All', artist: 'LF SYSTEM', bpm: 124, key: '4A', energy: 7, resonance: 9, genre: 'Disco House', duration: '02:50', coverUrl: 'https://picsum.photos/100/100?random=403' },
  { id: '404', title: 'Afraid To Feel', artist: 'LF SYSTEM', bpm: 128, key: '6A', energy: 7, resonance: 8, genre: 'Disco House', duration: '02:58', coverUrl: 'https://picsum.photos/100/100?random=404' },
  { id: '405', title: 'Do It To It', artist: 'ACRAZE', bpm: 125, key: '11A', energy: 8, resonance: 9, genre: 'Tech House', duration: '02:37', coverUrl: 'https://picsum.photos/100/100?random=405' },
  { id: '406', title: 'Ferrari', artist: 'James Hype', bpm: 125, key: '6A', energy: 7, resonance: 8, genre: 'Tech House', duration: '03:06', coverUrl: 'https://picsum.photos/100/100?random=406' },
  { id: '407', title: 'Where You Are', artist: 'John Summit', bpm: 126, key: '6A', energy: 8, resonance: 9, genre: 'House', duration: '03:56', coverUrl: 'https://picsum.photos/100/100?random=407' },
  { id: '408', title: 'Relax My Eyes', artist: 'ANOTR', bpm: 132, key: '3A', energy: 6, resonance: 8, genre: 'House', duration: '06:36', coverUrl: 'https://picsum.photos/100/100?random=408' },
  { id: '409', title: 'Make Me', artist: 'Borai & Denham Audio', bpm: 134, key: '10A', energy: 8, resonance: 7, genre: 'House', duration: '02:37', coverUrl: 'https://picsum.photos/100/100?random=409' },
  { id: '410', title: 'Escape', artist: 'Kx5 (deadmau5 & Kaskade)', bpm: 126, key: '11B', energy: 8, resonance: 8, genre: 'Progressive House', duration: '04:00', coverUrl: 'https://picsum.photos/100/100?random=410' },
  { id: '411', title: 'Turn Back Time', artist: 'Diplo & Sonny Fodera', bpm: 124, key: '2A', energy: 7, resonance: 7, genre: 'House', duration: '02:59', coverUrl: 'https://picsum.photos/100/100?random=411' },
  { id: '412', title: 'On My Mind', artist: 'Diplo & SIDEPIECE', bpm: 123, key: '7A', energy: 8, resonance: 8, genre: 'Tech House', duration: '03:09', coverUrl: 'https://picsum.photos/100/100?random=412' },
  { id: '413', title: 'Goosebumps', artist: 'HVME', bpm: 125, key: '6A', energy: 7, resonance: 8, genre: 'Deep House', duration: '02:43', coverUrl: 'https://picsum.photos/100/100?random=413' },
  { id: '414', title: 'The Motto', artist: 'Tiësto & Ava Max', bpm: 118, key: '7A', energy: 8, resonance: 9, genre: 'Dance Pop', duration: '02:44', coverUrl: 'https://picsum.photos/100/100?random=414' },
  { id: '415', title: 'Moth To A Flame', artist: 'Swedish House Mafia', bpm: 120, key: '5A', energy: 7, resonance: 9, genre: 'House', duration: '03:54', coverUrl: 'https://picsum.photos/100/100?random=415' },
  { id: '416', title: 'Don\'t You Worry Child', artist: 'Swedish House Mafia', bpm: 129, key: '11B', energy: 9, resonance: 10, genre: 'Progressive House', duration: '03:32', coverUrl: 'https://picsum.photos/100/100?random=416' },
  { id: '417', title: 'Summer', artist: 'Calvin Harris', bpm: 128, key: '5A', energy: 9, resonance: 10, genre: 'Electro House', duration: '03:42', coverUrl: 'https://picsum.photos/100/100?random=417' },
  { id: '418', title: 'This Is What You Came For', artist: 'Calvin Harris ft. Rihanna', bpm: 124, key: '9A', energy: 7, resonance: 10, genre: 'House', duration: '03:42', coverUrl: 'https://picsum.photos/100/100?random=418' },
  { id: '419', title: 'Feel So Close', artist: 'Calvin Harris', bpm: 128, key: '7A', energy: 8, resonance: 10, genre: 'House', duration: '03:26', coverUrl: 'https://picsum.photos/100/100?random=419' },
  { id: '420', title: 'Latch', artist: 'Disclosure ft. Sam Smith', bpm: 122, key: '11A', energy: 7, resonance: 9, genre: 'Deep House', duration: '04:16', coverUrl: 'https://picsum.photos/100/100?random=420' },

  // Techno / Peak Time / Industrial (10 Tracks)
  { id: '421', title: 'Metro', artist: 'Kevin de Vries & Mau P', bpm: 126, key: '5A', energy: 8, resonance: 7, genre: 'Melodic Techno', duration: '05:56', coverUrl: 'https://picsum.photos/100/100?random=421' },
  { id: '422', title: 'Push Up', artist: 'Creeds', bpm: 160, key: '4A', energy: 10, resonance: 9, genre: 'Techno', duration: '04:00', coverUrl: 'https://picsum.photos/100/100?random=422' },
  { id: '423', title: 'Fine Day Anthem', artist: 'Skrillex & Boys Noize', bpm: 138, key: '10A', energy: 9, resonance: 8, genre: 'Techno', duration: '03:20', coverUrl: 'https://picsum.photos/100/100?random=423' },
  { id: '424', title: 'Rave', artist: 'Sam Paganini', bpm: 130, key: '2A', energy: 8, resonance: 7, genre: 'Techno', duration: '06:46', coverUrl: 'https://picsum.photos/100/100?random=424' },
  { id: '425', title: 'I Want You', artist: 'Laidback Luke', bpm: 132, key: '4A', energy: 8, resonance: 6, genre: 'Techno', duration: '03:12', coverUrl: 'https://picsum.photos/100/100?random=425' },
  { id: '426', title: 'Drugs From Amsterdam (Reinier Zonneveld Remix)', artist: 'Mau P', bpm: 140, key: '10A', energy: 10, resonance: 8, genre: 'Acid Techno', duration: '04:54', coverUrl: 'https://picsum.photos/100/100?random=426' },
  { id: '427', title: 'Das Boot', artist: 'U96', bpm: 128, key: '4A', energy: 7, resonance: 8, genre: 'Techno', duration: '05:14', coverUrl: 'https://picsum.photos/100/100?random=427' },
  { id: '428', title: 'Born Slippy', artist: 'Underworld', bpm: 140, key: '9A', energy: 8, resonance: 10, genre: 'Techno', duration: '11:37', coverUrl: 'https://picsum.photos/100/100?random=428' },
  { id: '429', title: 'Insomnia', artist: 'Faithless', bpm: 127, key: '11A', energy: 7, resonance: 10, genre: 'Trance/Techno', duration: '08:43', coverUrl: 'https://picsum.photos/100/100?random=429' },
  { id: '430', title: 'Satisfaction', artist: 'Benny Benassi', bpm: 130, key: '11A', energy: 8, resonance: 10, genre: 'Electro', duration: '04:46', coverUrl: 'https://picsum.photos/100/100?random=430' },

  // Hip Hop / R&B / Trap (15 Tracks)
  { id: '431', title: 'Paint The Town Red', artist: 'Doja Cat', bpm: 100, key: '8A', energy: 6, resonance: 9, genre: 'Hip Hop', duration: '03:51', coverUrl: 'https://picsum.photos/100/100?random=431' },
  { id: '432', title: 'First Class', artist: 'Jack Harlow', bpm: 107, key: '4A', energy: 6, resonance: 9, genre: 'Hip Hop', duration: '02:53', coverUrl: 'https://picsum.photos/100/100?random=432' },
  { id: '433', title: 'WAIT FOR U', artist: 'Future', bpm: 85, key: '1A', energy: 5, resonance: 8, genre: 'Trap', duration: '03:09', coverUrl: 'https://picsum.photos/100/100?random=433' },
  { id: '434', title: 'Super Freaky Girl', artist: 'Nicki Minaj', bpm: 133, key: '2A', energy: 8, resonance: 9, genre: 'Hip Hop', duration: '02:50', coverUrl: 'https://picsum.photos/100/100?random=434' },
  { id: '435', title: 'Rich Flex', artist: 'Drake & 21 Savage', bpm: 153, key: '11A', energy: 7, resonance: 9, genre: 'Hip Hop', duration: '03:59', coverUrl: 'https://picsum.photos/100/100?random=435' },
  { id: '436', title: 'Mask Off', artist: 'Future', bpm: 150, key: '2A', energy: 6, resonance: 9, genre: 'Trap', duration: '03:24', coverUrl: 'https://picsum.photos/100/100?random=436' },
  { id: '437', title: 'Bad and Boujee', artist: 'Migos', bpm: 127, key: '4A', energy: 7, resonance: 9, genre: 'Trap', duration: '05:43', coverUrl: 'https://picsum.photos/100/100?random=437' },
  { id: '438', title: 'HUMBLE.', artist: 'Kendrick Lamar', bpm: 150, key: '1A', energy: 8, resonance: 9, genre: 'Hip Hop', duration: '02:57', coverUrl: 'https://picsum.photos/100/100?random=438' },
  { id: '439', title: 'Rockstar', artist: 'Post Malone', bpm: 160, key: '4A', energy: 6, resonance: 10, genre: 'Hip Hop', duration: '03:38', coverUrl: 'https://picsum.photos/100/100?random=439' },
  { id: '440', title: 'Sunflower', artist: 'Post Malone', bpm: 90, key: '2A', energy: 6, resonance: 10, genre: 'Pop Rap', duration: '02:37', coverUrl: 'https://picsum.photos/100/100?random=440' },
  { id: '441', title: 'The Real Slim Shady', artist: 'Eminem', bpm: 104, key: '4A', energy: 8, resonance: 10, genre: 'Hip Hop', duration: '04:44', coverUrl: 'https://picsum.photos/100/100?random=441' },
  { id: '442', title: 'Lose Yourself', artist: 'Eminem', bpm: 171, key: '2A', energy: 9, resonance: 10, genre: 'Hip Hop', duration: '05:26', coverUrl: 'https://picsum.photos/100/100?random=442' },
  { id: '443', title: 'Still D.R.E.', artist: 'Dr. Dre', bpm: 93, key: '11A', energy: 7, resonance: 10, genre: 'Hip Hop', duration: '04:30', coverUrl: 'https://picsum.photos/100/100?random=443' },
  { id: '444', title: 'Drop It Like It\'s Hot', artist: 'Snoop Dogg', bpm: 92, key: '1A', energy: 5, resonance: 9, genre: 'Hip Hop', duration: '04:26', coverUrl: 'https://picsum.photos/100/100?random=444' },
  { id: '445', title: 'Hypnotize', artist: 'The Notorious B.I.G.', bpm: 94, key: '9A', energy: 6, resonance: 10, genre: 'Hip Hop', duration: '03:50', coverUrl: 'https://picsum.photos/100/100?random=445' },

  // Pop / Top 40 (20 Tracks)
  { id: '446', title: 'Flowers', artist: 'Miley Cyrus', bpm: 118, key: '12A', energy: 6, resonance: 10, genre: 'Pop', duration: '03:20', coverUrl: 'https://picsum.photos/100/100?random=446' },
  { id: '447', title: 'Cruel Summer', artist: 'Taylor Swift', bpm: 170, key: '9A', energy: 8, resonance: 10, genre: 'Pop', duration: '02:58', coverUrl: 'https://picsum.photos/100/100?random=447' },
  { id: '448', title: 'Anti-Hero', artist: 'Taylor Swift', bpm: 97, key: '4A', energy: 5, resonance: 9, genre: 'Pop', duration: '03:20', coverUrl: 'https://picsum.photos/100/100?random=448' },
  { id: '449', title: 'As It Was', artist: 'Harry Styles', bpm: 174, key: '2A', energy: 7, resonance: 10, genre: 'Pop', duration: '02:47', coverUrl: 'https://picsum.photos/100/100?random=449' },
  { id: '450', title: 'Unholy', artist: 'Sam Smith & Kim Petras', bpm: 131, key: '1A', energy: 7, resonance: 9, genre: 'Pop', duration: '02:36', coverUrl: 'https://picsum.photos/100/100?random=450' },
  { id: '451', title: 'Vampire', artist: 'Olivia Rodrigo', bpm: 138, key: '5A', energy: 6, resonance: 9, genre: 'Pop Rock', duration: '03:39', coverUrl: 'https://picsum.photos/100/100?random=451' },
  { id: '452', title: 'Good 4 U', artist: 'Olivia Rodrigo', bpm: 167, key: '9A', energy: 9, resonance: 9, genre: 'Pop Punk', duration: '02:58', coverUrl: 'https://picsum.photos/100/100?random=452' },
  { id: '453', title: 'Dance The Night', artist: 'Dua Lipa', bpm: 110, key: '11A', energy: 7, resonance: 9, genre: 'Disco Pop', duration: '02:56', coverUrl: 'https://picsum.photos/100/100?random=453' },
  { id: '454', title: 'Barbie World', artist: 'Nicki Minaj & Ice Spice', bpm: 144, key: '1A', energy: 8, resonance: 9, genre: 'Rap', duration: '01:49', coverUrl: 'https://picsum.photos/100/100?random=454' },
  { id: '455', title: 'Greedy', artist: 'Tate McRae', bpm: 111, key: '1A', energy: 6, resonance: 9, genre: 'Pop', duration: '02:11', coverUrl: 'https://picsum.photos/100/100?random=455' },
  { id: '456', title: 'Seven', artist: 'Jung Kook', bpm: 125, key: '11A', energy: 7, resonance: 10, genre: 'Pop/UKG', duration: '03:04', coverUrl: 'https://picsum.photos/100/100?random=456' },
  { id: '457', title: 'Bad Habit', artist: 'Steve Lacy', bpm: 169, key: '1A', energy: 5, resonance: 8, genre: 'R&B', duration: '03:52', coverUrl: 'https://picsum.photos/100/100?random=457' },
  { id: '458', title: 'Kill Bill', artist: 'SZA', bpm: 89, key: '8A', energy: 4, resonance: 9, genre: 'R&B', duration: '02:33', coverUrl: 'https://picsum.photos/100/100?random=458' },
  { id: '459', title: 'Creepin\'', artist: 'Metro Boomin', bpm: 98, key: '6A', energy: 5, resonance: 9, genre: 'R&B', duration: '03:41', coverUrl: 'https://picsum.photos/100/100?random=459' },
  { id: '460', title: 'Die For You', artist: 'The Weeknd', bpm: 67, key: '1A', energy: 5, resonance: 9, genre: 'R&B', duration: '04:20', coverUrl: 'https://picsum.photos/100/100?random=460' },
  { id: '461', title: 'Starboy', artist: 'The Weeknd', bpm: 186, key: '10A', energy: 7, resonance: 10, genre: 'R&B', duration: '03:50', coverUrl: 'https://picsum.photos/100/100?random=461' },
  { id: '462', title: 'Can\'t Stop The Feeling!', artist: 'Justin Timberlake', bpm: 113, key: '8A', energy: 8, resonance: 9, genre: 'Pop', duration: '03:56', coverUrl: 'https://picsum.photos/100/100?random=462' },
  { id: '463', title: 'Happy', artist: 'Pharrell Williams', bpm: 160, key: '10A', energy: 9, resonance: 10, genre: 'Soul', duration: '03:53', coverUrl: 'https://picsum.photos/100/100?random=463' },
  { id: '464', title: 'Shake It Off', artist: 'Taylor Swift', bpm: 160, key: '9A', energy: 9, resonance: 10, genre: 'Pop', duration: '03:39', coverUrl: 'https://picsum.photos/100/100?random=464' },
  { id: '465', title: 'Roar', artist: 'Katy Perry', bpm: 90, key: '12A', energy: 7, resonance: 10, genre: 'Pop', duration: '03:43', coverUrl: 'https://picsum.photos/100/100?random=465' },

  // Latin / Reggaeton (10 Tracks)
  { id: '466', title: 'Ella Baila Sola', artist: 'Eslabon Armado', bpm: 148, key: '5A', energy: 6, resonance: 9, genre: 'Regional Mexican', duration: '02:45', coverUrl: 'https://picsum.photos/100/100?random=466' },
  { id: '467', title: 'Un x100to', artist: 'Grupo Frontera', bpm: 83, key: '10A', energy: 5, resonance: 9, genre: 'Regional Mexican', duration: '03:14', coverUrl: 'https://picsum.photos/100/100?random=467' },
  { id: '468', title: 'La Bachata', artist: 'Manuel Turizo', bpm: 125, key: '8A', energy: 6, resonance: 8, genre: 'Bachata', duration: '02:42', coverUrl: 'https://picsum.photos/100/100?random=468' },
  { id: '469', title: 'Provenza', artist: 'Karol G', bpm: 111, key: '1A', energy: 6, resonance: 9, genre: 'Reggaeton', duration: '03:30', coverUrl: 'https://picsum.photos/100/100?random=469' },
  { id: '470', title: 'Me Porto Bonito', artist: 'Bad Bunny', bpm: 92, key: '6A', energy: 7, resonance: 9, genre: 'Reggaeton', duration: '02:58', coverUrl: 'https://picsum.photos/100/100?random=470' },
  { id: '471', title: 'Moscow Mule', artist: 'Bad Bunny', bpm: 100, key: '5A', energy: 6, resonance: 8, genre: 'Reggaeton', duration: '04:05', coverUrl: 'https://picsum.photos/100/100?random=471' },
  { id: '472', title: 'Despechá', artist: 'Rosalía', bpm: 130, key: '5A', energy: 8, resonance: 9, genre: 'Mambo', duration: '02:37', coverUrl: 'https://picsum.photos/100/100?random=472' },
  { id: '473', title: 'TQG', artist: 'Karol G & Shakira', bpm: 120, key: '8A', energy: 7, resonance: 9, genre: 'Reggaeton', duration: '03:18', coverUrl: 'https://picsum.photos/100/100?random=473' },
  { id: '474', title: 'Besos Moja2', artist: 'Wisin & Yandel', bpm: 94, key: '4A', energy: 7, resonance: 8, genre: 'Reggaeton', duration: '03:49', coverUrl: 'https://picsum.photos/100/100?random=474' },
  { id: '475', title: 'Mamiii', artist: 'Becky G & Karol G', bpm: 94, key: '7A', energy: 7, resonance: 9, genre: 'Reggaeton', duration: '03:47', coverUrl: 'https://picsum.photos/100/100?random=475' },

  // DnB / Bass / Dubstep (10 Tracks)
  { id: '476', title: 'Liquor & Cigarettes', artist: 'Chase & Status', bpm: 174, key: '8A', energy: 9, resonance: 8, genre: 'DnB', duration: '03:09', coverUrl: 'https://picsum.photos/100/100?random=476' },
  { id: '477', title: 'Disconnect', artist: 'Becky Hill', bpm: 174, key: '6A', energy: 9, resonance: 8, genre: 'DnB', duration: '02:44', coverUrl: 'https://picsum.photos/100/100?random=477' },
  { id: '478', title: 'Strangers', artist: 'Kenya Grace', bpm: 170, key: '10A', energy: 6, resonance: 9, genre: 'DnB', duration: '02:52', coverUrl: 'https://picsum.photos/100/100?random=478' },
  { id: '479', title: 'Prada', artist: 'cassö', bpm: 142, key: '4A', energy: 8, resonance: 9, genre: 'Bass House', duration: '02:12', coverUrl: 'https://picsum.photos/100/100?random=479' },
  { id: '480', title: 'Nanana', artist: 'Peggy Gou', bpm: 130, key: '9B', energy: 7, resonance: 10, genre: 'House', duration: '03:51', coverUrl: 'https://picsum.photos/100/100?random=480' }, // Dup but ok
  { id: '481', title: 'Dashstar*', artist: 'Knock2', bpm: 126, key: '4A', energy: 10, resonance: 8, genre: 'Bass House', duration: '03:22', coverUrl: 'https://picsum.photos/100/100?random=481' },
  { id: '482', title: 'Saddest Vanilla', artist: 'Riton', bpm: 125, key: '4A', energy: 8, resonance: 7, genre: 'House', duration: '03:02', coverUrl: 'https://picsum.photos/100/100?random=482' },
  { id: '483', title: 'Selecta', artist: 'Skrillex', bpm: 136, key: '1A', energy: 8, resonance: 7, genre: 'Bass', duration: '03:00', coverUrl: 'https://picsum.photos/100/100?random=483' },
  { id: '484', title: 'Baby again..', artist: 'Fred again..', bpm: 127, key: '10A', energy: 8, resonance: 8, genre: 'Tech House', duration: '05:20', coverUrl: 'https://picsum.photos/100/100?random=484' },
  { id: '485', title: 'XENA', artist: 'Skrillex', bpm: 145, key: '5A', energy: 9, resonance: 7, genre: 'Bass', duration: '03:10', coverUrl: 'https://picsum.photos/100/100?random=485' },

  // Rock / Indie / Alternative (5 Tracks)
  { id: '486', title: 'Do I Wanna Know?', artist: 'Arctic Monkeys', bpm: 85, key: '10A', energy: 6, resonance: 9, genre: 'Indie Rock', duration: '04:32', coverUrl: 'https://picsum.photos/100/100?random=486' },
  { id: '487', title: 'Pumped Up Kicks', artist: 'Foster The People', bpm: 128, key: '10A', energy: 7, resonance: 10, genre: 'Indie Pop', duration: '04:00', coverUrl: 'https://picsum.photos/100/100?random=487' },
  { id: '488', title: 'Take Me Out', artist: 'Franz Ferdinand', bpm: 105, key: '9A', energy: 8, resonance: 9, genre: 'Indie Rock', duration: '03:57', coverUrl: 'https://picsum.photos/100/100?random=488' },
  { id: '489', title: 'Fluorescent Adolescent', artist: 'Arctic Monkeys', bpm: 112, key: '9A', energy: 8, resonance: 8, genre: 'Indie Rock', duration: '02:57', coverUrl: 'https://picsum.photos/100/100?random=489' },
  { id: '490', title: 'Naive', artist: 'The Kooks', bpm: 103, key: '8A', energy: 7, resonance: 8, genre: 'Indie Pop', duration: '03:23', coverUrl: 'https://picsum.photos/100/100?random=490' },

  // Trance / Big Room (5 Tracks)
  { id: '491', title: 'On A Good Day', artist: 'Above & Beyond', bpm: 134, key: '1B', energy: 8, resonance: 9, genre: 'Trance', duration: '05:56', coverUrl: 'https://picsum.photos/100/100?random=491' },
  { id: '492', title: 'Sun & Moon', artist: 'Above & Beyond', bpm: 134, key: '4A', energy: 8, resonance: 9, genre: 'Trance', duration: '05:27', coverUrl: 'https://picsum.photos/100/100?random=492' },
  { id: '493', title: 'Language', artist: 'Porter Robinson', bpm: 128, key: '9A', energy: 9, resonance: 9, genre: 'Electro House', duration: '06:08', coverUrl: 'https://picsum.photos/100/100?random=493' },
  { id: '494', title: 'Calling (Lose My Mind)', artist: 'Sebastian Ingrosso', bpm: 126, key: '10B', energy: 9, resonance: 8, genre: 'Progressive House', duration: '06:15', coverUrl: 'https://picsum.photos/100/100?random=494' },
  { id: '495', title: 'Reload', artist: 'Sebastian Ingrosso', bpm: 128, key: '1A', energy: 9, resonance: 9, genre: 'Progressive House', duration: '06:00', coverUrl: 'https://picsum.photos/100/100?random=495' },

  // Classics / Throwbacks (5 Tracks)
  { id: '496', title: 'Show Me Love', artist: 'Robin S', bpm: 120, key: '10A', energy: 7, resonance: 10, genre: 'House', duration: '04:29', coverUrl: 'https://picsum.photos/100/100?random=496' },
  { id: '497', title: 'Gypsy Woman', artist: 'Crystal Waters', bpm: 120, key: '6A', energy: 6, resonance: 10, genre: 'House', duration: '03:45', coverUrl: 'https://picsum.photos/100/100?random=497' },
  { id: '498', title: 'Rhythm Is A Dancer', artist: 'Snap!', bpm: 124, key: '10A', energy: 7, resonance: 10, genre: 'Eurodance', duration: '05:32', coverUrl: 'https://picsum.photos/100/100?random=498' },
  { id: '499', title: 'Pump Up The Jam', artist: 'Technotronic', bpm: 125, key: '10A', energy: 8, resonance: 10, genre: 'House', duration: '05:22', coverUrl: 'https://picsum.photos/100/100?random=499' },
  { id: '500', title: 'Blue (Da Ba Dee)', artist: 'Eiffel 65', bpm: 128, key: '6A', energy: 8, resonance: 10, genre: 'Eurodance', duration: '04:44', coverUrl: 'https://picsum.photos/100/100?random=500' },

  // --- MOCK REMIXES FOR TESTING ---
  { id: '1001', title: 'Midnight City (Eric Prydz Private Remix)', artist: 'M83', bpm: 126, key: '6A', energy: 9, resonance: 10, genre: 'Progressive House', duration: '06:01', coverUrl: 'https://picsum.photos/100/100?random=1001' },
  { id: '1002', title: 'One More Time (Zedd Remix)', artist: 'Daft Punk', bpm: 128, key: '10A', energy: 9, resonance: 9, genre: 'Electro House', duration: '05:50', coverUrl: 'https://picsum.photos/100/100?random=1002' },
  { id: '1003', title: 'Losing It (Odd Mob Remix)', artist: 'FISHER', bpm: 126, key: '2A', energy: 9, resonance: 9, genre: 'Tech House', duration: '05:12', coverUrl: 'https://picsum.photos/100/100?random=1003' },
  { id: '1004', title: 'Flowers (Demo)', artist: 'Miley Cyrus', bpm: 115, key: '12A', energy: 5, resonance: 9, genre: 'Pop', duration: '03:10', coverUrl: 'https://picsum.photos/100/100?random=1004' },
  { id: '1005', title: 'Blue (David Guetta & Bebe Rexha Remix)', artist: 'Eiffel 65', bpm: 128, key: '6A', energy: 9, resonance: 9, genre: 'Dance Pop', duration: '02:55', coverUrl: 'https://picsum.photos/100/100?random=1005' },
];

/**
 * Service to handle data interactions.
 * Replace the contents of these functions to connect to your real API.
 */
class TrackService implements ITrackService {
  
  // Simulate network delay
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getAllTracks(): Promise<Track[]> {
    await this.delay(500); // Simulate API latency
    return [...MOCK_LIBRARY];
  }

  async saveSetList(setList: SetList): Promise<void> {
    await this.delay(800);
    console.log('Saved setlist:', setList);
    // Here you would do: await fetch('/api/setlists', { method: 'POST', body: JSON.stringify(setList) });
  }
}

export const trackService = new TrackService();
