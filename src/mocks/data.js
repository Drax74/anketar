// Fictional layout stress data. No real group members or backend rows are used.
export const mockScenarios = ['crowded', 'tied', 'empty'];

const names = [
    'Željka Marić', 'Aleksandra Katarina Horvat-Novak', 'Petar Šimunović', 'Iva Đurić',
    'Luka Babić', 'Ema Kovačević', 'Nikola Čuljak', 'Sara Šarić',
    'Filip Jurišić', 'Lucija Grgić', 'Matej Božić', 'Nika Blažević',
    'Ivan Vuković', 'Marta Pavlović', 'David Petrović', 'Dora Vidović',
    'Marko Živković', 'Petra Knežević', 'Tin Lovrić', 'Lana Radić',
    'Borna Perić', 'Lea Matijević', 'Fran Stanić', 'Ena Janković',
    'Jakov Martinović', 'Klara Tadić', 'Roko Tomić', 'Tena Barišić',
    'Noa Pranjić', 'Eva Zorić', 'Ante Miličević', 'Ana Marija Novak-Kovačić'
];
const titles = [
    'Veliki svijetli apartman za cijelu ekipu u srcu Madrida, blizu metroa i svih najvažnijih znamenitosti',
    'Loft Sol s terasom i pogledom na grad', 'Kuća u mirnoj četvrti Retiro',
    'ApartmanSuperDugačkogNazivaBezRazmakaZaProvjeruPrijelomaTekstaUMadridu',
    'Smještaj <b>Madrid</b> & "ekipa"', 'Prostrani stan uz Gran Víu',
    'Malasaña: šareni dom s velikom blagovaonicom', 'Chueca – smještaj za dvije obitelji',
    'Studio s dvije spavaće sobe i dodatnim kaučem', 'Apartman s pristupom bez stepenica',
    'Povoljan smještaj u blizini kolodvora Atocha', 'Dvosobni apartman s malom kuhinjom',
    'Smještaj bez fotografije', 'Prijedlog bez unesene cijene',
    'Udobna kuća s unutarnjim dvorištem', 'Novi prijedlog koji još nema glasova'
];

export function createMockData(scenario = 'crowded') {
    const members = names.map((name, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        email: `member${index + 1}@example.test`, name,
        role: index === 0 ? 'super_admin' : 'user'
    }));
    const options = scenario === 'empty' ? [] : titles.map((title, index) => ({
        id: `mock-stay-${index + 1}`, title,
        price: index === 13 ? 'N/A' : `${450 + index * 125}.50€`,
        image: index === 12 ? '' : '/anketar/hero-cover-image.webp',
        link: `https://www.airbnb.com/rooms/mock-${index + 1}`,
        created_by: members[index % members.length].email,
        description: 'Izmišljeni prijedlog za provjeru izgleda aplikacije. '.repeat(index === 0 ? 20 : 3),
        note: index % 3 === 0 ? 'Provjeriti raspored kreveta, ukupan iznos i uvjete otkazivanja. '.repeat(3) : '',
        is_taken: [2, 5, 10].includes(index)
    }));
    const counts = [28, scenario === 'tied' ? 28 : 24, 19, 14, 11, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0];
    const votes = options.flatMap((option, index) => members.slice(0, counts[index]).map((member, voteIndex) => ({
        id: `mock-vote-${index}-${voteIndex}`, option_id: option.id, user_email: member.email
    })));
    return { version: 1, scenario, members, options, votes };
}
