import fs from 'fs';
const path = 'c:/Users/ALVARO/Desktop/cytio/frontend/src/pages/Monitor.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. currentTime state
if (!content.includes('currentTime')) {
    content = content.replace(
        /const \[finishedTrip, setFinishedTrip\] = useState<Trip \| null>\(null\);/,
        `const [finishedTrip, setFinishedTrip] = useState<Trip | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 10000);
        return () => clearInterval(timer);
    }, []);`
    );
}

// 2. Badge & Counter
if (!content.includes('currentTime.getTime()')) {
    const oldBadge = `<span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 uppercase tracking-wide border border-yellow-500/20 whitespace-nowrap">
                                                {trip.status}
                                            </span>`;
    const newBadge = `<div className="flex flex-col items-end gap-1 shrink-0">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 uppercase tracking-wide border border-yellow-500/20 whitespace-nowrap">
                                                    {trip.status}
                                                </span>
                                                {trip.status === 'Programado' && trip.scheduledAt && (() => {
                                                    const sched = new Date(trip.scheduledAt);
                                                    const diff = currentTime.getTime() - sched.getTime();
                                                    if (diff > 0) {
                                                        const totalMins = Math.floor(diff / 60000);
                                                        const display = totalMins < 60 ? \`+\${totalMins}m\` : \`+\${Math.floor(totalMins / 60)}h \${totalMins % 60}m\`;
                                                        return (
                                                            <span className="text-[10px] font-black text-red-500 animate-pulse bg-red-500/10 px-1.5 py-0.5 rounded">
                                                                {display}
                                                            </span>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>`;
    content = content.replace(oldBadge, newBadge);
}

// 3. Confirmar button condition
content = content.replace(
    /\(\(trip\.status === 'Pendiente de Confirmación' \|\| trip\.status === 'Programado'\) && \(!trip\.clientConfirmed && trip\.businessId\)\)/g,
    `((trip.status === 'Pendiente de Confirmación' || trip.status === 'Programado') && !trip.clientConfirmed)`
);

fs.writeFileSync(path, content);
console.log('Monitor.tsx updated successfully');
