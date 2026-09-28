import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "About · BenchMate",
  description: "What BenchMate is, who it's for, how a session works, what you can say, and how your data is handled.",
};

const SESSION_FLOW = [
  {
    title: "Pick a protocol",
    body: "Start with the practice run, one of the sample protocols, or paste your own. If you paste your own, BenchMate splits it into numbered steps and double-checks that every number from your text (volumes, speeds, times) made it into the steps.",
  },
  {
    title: "Check the steps",
    body: "You see every step before you begin and can fix, reorder, add or remove any of them. BenchMate reads them out word for word, so what you see is exactly what you'll hear.",
  },
  {
    title: "Start listening",
    body: "Press one button and put your hands back on the work. From here on everything is by voice: move between steps, ask questions, record numbers, start timers.",
  },
  {
    title: "Talk as you work",
    body: "Every time you record something, BenchMate says it back so you can catch a mishearing right away. The screen shows the current step in large type, your running notes, and any timers.",
  },
  {
    title: "Say “I’m done”",
    body: "BenchMate asks you to confirm, ends the session, and shows your notebook entry. Copy it, download it, or print it to PDF.",
  },
];

const PHRASES: { group: string; items: [string, string][] }[] = [
  {
    group: "Moving through the steps",
    items: [
      ["“Start”", "Reads step 1"],
      ["“Next” · “Go back” · “Go to step 5”", "Moves and reads the step"],
      ["“Say that again” · “Where am I?”", "Repeats the current step"],
      ["“What speed was that spin?”", "Answers from the protocol text"],
    ],
  },
  {
    group: "Recording what happens",
    items: [
      ["“Sample two, 245 nanograms per microliter”", "Records a reading and says it back"],
      ["“Done, but I spun for three minutes, not one”", "Records a change from the plan, then moves on"],
      ["“Tube four looks cloudy”", "Records a note"],
    ],
  },
  {
    group: "Timers",
    items: [
      ["“Ten-minute timer”", "Starts a countdown and tells you when it ends"],
      ["“How long is left?” · “Cancel the timer”", "Checks or stops timers"],
    ],
  },
  {
    group: "Fixing mistakes",
    items: [
      ["“Scratch that”", "Crosses out the last thing recorded"],
      ["“No, 254 not 245”", "Crosses out the wrong number and records the right one"],
    ],
  },
  {
    group: "Everything else",
    items: [
      ["“Louder” · “Quieter”", "Changes BenchMate's volume"],
      ["“I’m done”", "Finishes the session and writes your notebook entry"],
    ],
  },
];

const GLOSSARY: [string, string][] = [
  ["Protocol", "A step-by-step recipe for a lab task, like a cooking recipe with exact amounts and times."],
  ["Bench", "The lab workbench. “At the bench” means doing the hands-on work."],
  ["Sample", "One of the things you're working on, usually a numbered tube (sample 1, sample 2, …)."],
  ["Reading (measurement)", "A number you read off an instrument, like a concentration or a temperature."],
  ["Change from plan (deviation)", "Anything you did differently from the protocol, like spinning for 3 minutes instead of 1."],
  ["Note (observation)", "Something you noticed, like a tube looking cloudy."],
  ["Lab notebook", "The official record of what was done. Scientists keep one for every experiment."],
  ["Crossed out (voided)", "An entry you took back. It is kept, struck through, so the record stays honest."],
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <section className="fade-up flex flex-col gap-5">
          <p className="text-sm font-medium text-accent">About BenchMate</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">A lab partner that listens, reads aloud, and takes the notes.</h1>
          <p className="text-lg text-muted">
            In a lab, your hands are usually busy: gloves on, holding a pipette, balancing tubes. Stopping to read the next step or to write a
            number down means taking gloves off, touching a pen or a keyboard, and losing your place. Many people end up scribbling numbers on
            their gloves or a paper towel and copying them up later, which is exactly where mistakes creep in.
          </p>
          <p className="text-lg text-muted">
            BenchMate removes that juggling. It reads your protocol to you one step at a time, listens for what you want to record, says each
            record back so you can catch mistakes, and at the end writes a clean, complete notebook entry. You only talk; you never need to
            touch the screen.
          </p>
        </section>

        <Section title="Who it's for">
          <ul className="grid gap-3 sm:grid-cols-2">
            <Card title="Scientists and lab technicians">Anyone following a written procedure with gloved hands who needs a reliable record of what happened.</Card>
            <Card title="Students and newcomers">Learning a new protocol is easier when someone reads the next step out loud and you never lose your place.</Card>
            <Card title="Anyone curious">The practice run uses coloured water and a few tubes, so you can see how it works at your desk, no lab needed.</Card>
            <Card title="Teams that audit their work">Nothing is ever deleted: corrections are crossed out and kept, and the full transcript is attached.</Card>
          </ul>
        </Section>

        <Section title="How a session goes">
          <ol className="flex flex-col gap-0">
            {SESSION_FLOW.map((s, i) => (
              <li key={s.title} className="relative flex gap-5 pb-8 last:pb-0">
                {i < SESSION_FLOW.length - 1 && <span className="absolute left-[17px] top-10 h-[calc(100%-2.5rem)] w-px bg-border" aria-hidden />}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent">{i + 1}</span>
                <div className="flex flex-col gap-1 pt-1">
                  <h3 className="font-semibold text-text">{s.title}</h3>
                  <p className="text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Things you can say" intro="Speak naturally. These are examples, not exact commands.">
          <div className="flex flex-col gap-6">
            {PHRASES.map((g) => (
              <div key={g.group} className="overflow-hidden rounded-2xl border border-border">
                <h3 className="bg-surface-2 px-5 py-2.5 text-sm font-semibold text-text">{g.group}</h3>
                <dl className="divide-y divide-border bg-surface">
                  {g.items.map(([say, does]) => (
                    <div key={say} className="grid gap-1 px-5 py-3 sm:grid-cols-[1.2fr_1fr] sm:gap-4">
                      <dt className="text-text">{say}</dt>
                      <dd className="text-muted">{does}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Why you can trust the record">
          <ul className="flex flex-col gap-3 text-muted">
            <Point>
              <strong className="text-text">The app keeps the record, not the AI.</strong> The protocol, your position in it and every number are held by
              the app. The voice assistant can only change them through a small set of well-defined actions, like “record a reading”.
            </Point>
            <Point>
              <strong className="text-text">Everything is read back.</strong> Each reading is repeated to you right after you say it, so a mishearing is
              caught in the moment, not weeks later.
            </Point>
            <Point>
              <strong className="text-text">Nothing is deleted.</strong> “Scratch that” crosses an entry out; it stays in the record as a crossed-out line.
            </Point>
            <Point>
              <strong className="text-text">The notebook entry is assembled, not written.</strong> It is built directly from your recorded entries, so it
              can&apos;t invent or reword a value. The full conversation is attached at the end.
            </Point>
          </ul>
        </Section>

        <Section title="Your data and privacy">
          <ul className="flex flex-col gap-3 text-muted">
            <Point>Protocols, readings, notes and notebook entries are stored only in this browser. There are no accounts and no database.</Point>
            <Point>Your voice is sent to AssemblyAI only while a session is live, to understand what you say and to speak back.</Point>
            <Point>Pasted protocol text is sent to AssemblyAI once, to split it into steps.</Point>
            <Point>Clearing your browser&apos;s site data deletes your sessions, so download entries you want to keep.</Point>
          </ul>
        </Section>

        <Section title="Tips for a smooth session">
          <ul className="flex flex-col gap-3 text-muted">
            <Point>Use a laptop&apos;s built-in speakers and mic in Chrome or Edge. Headphones aren&apos;t needed.</Point>
            <Point>Stand where you&apos;ll work and use the sound check on the setup screen before you start.</Point>
            <Point>You can interrupt BenchMate at any time; it stops talking and listens.</Point>
            <Point>If the connection drops, keep working. It reconnects by itself and nothing you recorded is lost.</Point>
            <Point>Prefer typing? Press T on the session screen to type instead of speaking.</Point>
          </ul>
        </Section>

        <Section title="Under the hood">
          <p className="text-muted">
            BenchMate is built on the AssemblyAI Voice Agent API: real-time speech recognition tuned with the protocol&apos;s own vocabulary, natural
            turn-taking so it knows when you&apos;ve finished speaking, the ability to be interrupted mid-sentence, and tool calls that let the assistant
            act on the app&apos;s record. Pasted protocols are split into steps with the AssemblyAI LLM Gateway. The app itself is a Next.js web app.
          </p>
        </Section>

        <Section title="Words you'll see">
          <dl className="grid gap-3 sm:grid-cols-2">
            {GLOSSARY.map(([term, def]) => (
              <div key={term} className="rounded-2xl border border-border bg-surface px-5 py-4">
                <dt className="font-semibold text-text">{term}</dt>
                <dd className="mt-1 text-[15px] text-muted">{def}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <section className="flex flex-col items-start gap-4 rounded-3xl border border-accent/30 bg-accent-soft/60 p-8">
          <h2 className="text-xl font-semibold text-text">Ready to try it?</h2>
          <p className="text-muted">The practice run takes about two minutes and needs nothing but your voice.</p>
          <Link href="/" className={buttonClass("primary", "lg")}>
            Go to the start
          </Link>
        </section>
      </main>
    </>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-text">{title}</h2>
        {intro && <p className="text-muted">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-semibold text-text">{title}</h3>
      <p className="mt-1 text-[15px] text-muted">{children}</p>
    </li>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
