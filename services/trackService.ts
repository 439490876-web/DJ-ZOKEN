import { Track, MusicalKey, ITrackService, SetList } from '../types';

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
];

/**
 * Service to handle data interactions.
 * Replace the contents of these functions to connect to your real backend.
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
    console.log('Saved setlist to backend:', setList);
    // Here you would do: await fetch('/api/setlists', { method: 'POST', body: JSON.stringify(setList) });
  }
}

export const trackService = new TrackService();