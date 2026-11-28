"""Build reports/joint-controllers-2026-11-27.html: the composed joint-controller design (Zach, Daily Note 2026-11-27).

    python3 /home/bam/robot_sdk/docs/build_joint_controllers_report.py

Self-contained HTML, inline SVG diagrams, one terminal capture (docs/joint_controllers_pick_cell.txt, the real output of
`python -m examples.pick_cell.cell --until 1.0` in /home/bam/like_keras). Sections live in SECTIONS below; the
transmission section is filled from docs/joint_controllers_transmission.html when it exists.
"""

from __future__ import annotations

import html
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path("/home/bam/robot_sdk/reports/joint-controllers-2026-11-27.html")


def read(name: str, default: str = "") -> str:
    path = HERE / name
    return path.read_text() if path.exists() else default


def box(x, y, w, h, title, sub="", cls="b"):
    sub_svg = f'<text x="{x + w / 2}" y="{y + h / 2 + 15}" class="s">{html.escape(sub)}</text>' if sub else ""
    ty = y + h / 2 + (0 if sub else 5)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" class="{cls}"/>'
            f'<text x="{x + w / 2}" y="{ty}" class="t">{html.escape(title)}</text>{sub_svg}')


def wire(x1, y1, x2, y2, label="", cls="w", lx=None, ly=None):
    lx = (x1 + x2) / 2 if lx is None else lx
    ly = (y1 + y2) / 2 - 6 if ly is None else ly
    lab = f'<text x="{lx}" y="{ly}" class="l">{html.escape(label)}</text>' if label else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="{cls}" marker-end="url(#a)"/>{lab}'


def svg(width, height, body, title):
    return (f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}">'
            '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" class="ah"/></marker></defs>' + body + "</svg>")


# ------------------------------------------------------------------ diagram 1: the stack, layers

def stack_diagram():
    b = ""
    b += box(20, 20, 760, 60, "Callers: planners · homing · recovery · pick loop · scripts",
             "they only ever send JointTrajectory or JointCommand (servo names), and read state + result", "c")
    b += box(20, 120, 230, 70, "JTC", "robot_controllers", "k")
    b += box(285, 120, 230, 70, "Joint Command Controller", "recipes: home, move, stop, brake", "k")
    b += box(550, 120, 230, 70, "Collision detector", "read-only: contact per joint", "r")
    b += box(20, 225, 760, 50, "Controller manager: claims per joint · priority · stop wins (the one writer)", "", "m")
    b += box(20, 310, 760, 60, "Bus box (role \u201cArm\u201d): ServoCommand in \u2192 ServoState out",
             "bound at deploy time: moteus over CAN  |  twin  |  MuJoCo", "io")
    b += box(20, 405, 760, 50, "Parts: moteus boards, encoders, cameras (robot_parts, datasheets)", "", "p")
    b += '<text x="790" y="55" class="side">goals</text><text x="790" y="160" class="side">controllers</text>'
    b += '<text x="790" y="255" class="side">mux</text><text x="790" y="345" class="side">I/O</text><text x="790" y="435" class="side">hardware</text>'
    return svg(880, 465, b, "Layer stack")


# ------------------------------------------------------------------ diagram 2: composition wiring

def composition_diagram():
    b = ""
    b += box(20, 20, 820, 50, "Callers", "send JointTrajectory to the JTC, JointCommand to the JCC; read state + results", "c")
    b += box(40, 130, 230, 70, "Joint Command Controller", "primitives: Command/Delay/Condition", "k")
    b += box(330, 130, 220, 70, "JTC", "robot_controllers", "k")
    b += box(610, 130, 220, 70, "Collision detector", "read-only: contact[joint]", "r")
    b += box(120, 270, 520, 64, "Controller manager (the mux)", "robot_msgs df7fd6b: claims per joint, priority, stop always wins", "m")
    b += box(120, 390, 520, 56, "Bus box (role Arm)", "moteus | twin | test", "io")
    b += wire(155, 70, 155, 130, "JointCommand", lx=200, ly=105)
    b += wire(440, 70, 440, 130, "JointTrajectory", lx=490, ly=105)
    b += wire(270, 150, 330, 150, "follow", ly=118)
    b += wire(330, 185, 270, 185, "status", cls="w2", ly=214)
    b += wire(155, 200, 250, 270, "command", lx=170, ly=240)
    b += wire(440, 200, 440, 270, "command", lx=480, ly=240)
    b += wire(610, 165, 550, 165, "contact", cls="w2", ly=180)
    b += '<path d="M700,200 C700,245 200,240 160,202" class="w2" fill="none" marker-end="url(#a)"/>'
    b += wire(380, 334, 380, 390, "ServoCommand + mode", lx=450, ly=368, cls="wbold")
    b += wire(640, 418, 720, 200, "ServoState → everyone", cls="w2", lx=760, ly=330)
    b += ('<text x="20" y="476" class="note">Every box is its own box, wired side by side. The JCC talks to the JTC the way any caller would '
          '(send a trajectory, read its status).</text>'
          '<text x="20" y="494" class="note">Only the manager is wired to the bus: one writer per joint, by wiring. Dashed = feedback.</text>')
    return svg(860, 505, b, "Composed controllers")


# ------------------------------------------------------------------ diagram 3: same System, two bindings

def binding_diagram():
    b = ""
    b += box(250, 20, 360, 60, "System “arm_controller” (wiring never changes)", "jtc · jcc · detector · role Arm", "k")
    b += box(20, 160, 250, 70, "bind = REAL", "MoteusBusPy: opens CAN, fdcanusb", "io")
    b += box(305, 160, 250, 70, "bind = SIM / twin", "fake moteus bus + plant", "io")
    b += box(590, 160, 250, 70, "bind = TEST", "a scripted double", "io")
    b += wire(330, 80, 145, 160, "Deployment(bind=REAL)", lx=150, ly=112)
    b += wire(430, 80, 430, 160, "bind=SIM", lx=470, ly=125)
    b += wire(530, 80, 715, 160, "bind=TEST", lx=670, ly=118)
    b += ('<text x="20" y="270" class="note">“Bus backend” = whatever implementation the role Arm is bound to. '
          'Callers and controllers above it cannot tell which one is running.</text>')
    return svg(860, 285, b, "One System, three bindings")


# ------------------------------------------------------------------ diagram 4: collision as a read-only box

def collision_diagram():
    b = ""
    b += box(20, 120, 200, 70, "Bus box", "ServoState", "io")
    b += box(300, 120, 230, 70, "Collision detector", "Out: contact[joint], residual", "r")
    b += box(620, 20, 220, 60, "JTC", "abort + report ‘contact’", "k")
    b += box(620, 115, 220, 60, "JCC", "decides the servo reaction", "k")
    b += box(620, 210, 220, 60, "Home(joint) goal", "contact = success", "c")
    b += wire(220, 155, 300, 155, "state")
    b += wire(530, 140, 620, 55, "contact", lx=560, ly=88)
    b += wire(530, 155, 620, 145, "contact", ly=142)
    b += wire(530, 170, 620, 240, "contact", lx=560, ly=222)
    b += ('<text x="20" y="300" class="note">Detection is the same for every task; what it MEANS differs (Haddadin 2017). '
          'So the detector only reports, each reader interprets,</text>'
          '<text x="20" y="320" class="note">and only the JCC, the one writer, turns it into hold / stop / brake on the servos.</text>')
    return svg(860, 330, b, "Collision fan-out")


# ------------------------------------------------------------------ diagram 5: where the transmission goes

def transmission_diagram():
    b = ""
    for x0, title, pick in ((20, "A. push down (2025, ros2_control HW interface)", False),
                            (450, "B. pull up (decided 2026-11-27)", True)):
        b += f'<text x="{x0 + 195}" y="22" class="t">{title}</text>'
        if pick:
            b += f'<rect x="{x0 - 8}" y="32" width="406" height="398" rx="12" class="pickbox"/>'
        rows = (["Planner: virtual j2v, j3v (\u201ca UR\u201d)", "JTC / JCC / manager in VIRTUAL joints",
                 "five-bar IK + H\u1d40 inside the bus", "Bus: J2, C1 boards"] if not pick else
                ["Planner: virtual j2v, j3v (\u201ca UR\u201d)", "robot model: to_servo_trajectory (fb.inverse + H\u1d40)",
                 "JTC / JCC / manager in SERVO joints", "Bus: sign/offset/zero \u2192 J2, C1 boards"])
        kinds = ["c", "k", "r", "io"] if not pick else ["c", "r", "k", "io"]
        for i, (label, kind) in enumerate(zip(rows, kinds)):
            y = 50 + i * 95
            b += box(x0, y, 390, 56, label, "", kind)
            if i < 3:
                b += wire(x0 + 195, y + 56, x0 + 195, y + 95)
    b += ('<text x="20" y="455" class="note">Red = where the five-bar mapping sits. In A the controllers think in a space the boards '
          'don\u2019t close their loops in; in B everything below the red box is one joint = one servo.</text>')
    return svg(860, 478, b, "Transmission placement")


# ------------------------------------------------------------------ Arm proposals: one small stack per proposal

def arm_stack(layers, side=None, height=None):
    """layers: (title, sub, kind) top to bottom; side: (title, sub, kind, from_layer, to_layer) drawn at the right."""
    b, y, w = "", 14, 470
    ys = []
    for title, sub, kind in layers:
        b += box(20, y, w, 52, title, sub, kind)
        ys.append(y)
        y += 82
    for top in ys[:-1]:
        b += wire(255, top + 52, 255, top + 82)
    if side:
        title, sub, kind, a, z = side
        b += box(540, ys[a], 300, ys[z] - ys[a] + 52, title, sub, kind)
        b += wire(540, ys[a] + 26, 490, ys[a] + 26, "", cls="w2")
    return svg(860, height or y, b, "proposal stack")


def arm_diagrams():
    C = ("Controllers: JTC · JCC · manager", "address joints by NAME: j1, j2, c1, w1..", "k")
    BUS = ("Bus: fdcanusb | pi3hat | twin", "transport only: frames by CAN id", "io")
    out = {}
    out["P1"] = arm_stack([C, ("Arm  (role: ServoCommand in, ServoState out, joint names)", "binding = a JointTable: name → bus, can_id, sign, offset, zero", "m"), BUS],
                          side=("JointTable (config, not code)", "j2: can 12, sign −1, offset 0.3 · c1: can 13 …", "p", 1, 2))
    out["P2"] = arm_stack([C, ("Arm (names)", "JointMap: name ↔ servo id, sign, offset, zero", "m"),
                           ("ServoBus (servo ids)", "ServoBus.send({12: cmd, 13: cmd})", "r"), BUS],
                          side=("bring-up / debug", "wire straight to ServoBus by id", "c", 2, 2))
    out["P3"] = arm_stack([C, ("robotparts.connect(\"bam_fb_v2\", transport=…)", "returns an Arm: the part's datasheet carries its joint table", "m"), BUS],
                          side=("same call for a bought arm", "robotparts.connect(\"ur5e\", host=…) → Arm", "c", 1, 1))
    out["P4"] = arm_stack([("Callers", "send JointTrajectory | JointCommand to the ARM", "c"),
                           ("Arm = a System: manager + JTC + JCC + joint table", "like a UR controller cabinet", "m"), BUS],
                          side=("a UR5e binds the WHOLE Arm", "its own cabinet runs the JTC", "c", 1, 1))
    out["P5"] = arm_stack([C, ("(no Arm box)", "", "p"), ("Bus driver reads a name → can_id table", "rename at the wire", "io")])
    return out


CSS = """
:root{--bg:#fbfaf7;--fg:#1d1d1b;--mut:#6b6a66;--card:#fff;--line:#d9d6cf;--k:#e6efff;--kS:#3d6fd1;--r:#fdecea;--rS:#c2493d;
--io:#eaf6ee;--ioS:#2f8a50;--c:#f3efe6;--cS:#8a7a55;--p:#f1f1f1;--pS:#888;--code:#f4f2ec}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe7;--mut:#a3a19b;--card:#1f1f1d;--line:#3a3935;--k:#1e2a44;--kS:#7fa3ff;
--r:#3a2220;--rS:#ff8a7d;--io:#1b3324;--ioS:#6fd39a;--c:#2c2a24;--cS:#d6c49a;--p:#262626;--pS:#999;--code:#24231f}}
body{background:var(--bg);color:var(--fg);font:16px/1.55 -apple-system,Segoe UI,Inter,sans-serif;margin:0}
main{max-width:980px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:28px;margin:.2em 0}h2{margin-top:2.2em;border-top:1px solid var(--line);padding-top:1em}
.verdict{font-size:19px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
figcaption{color:var(--mut);font-size:14px;margin-top:6px}
svg{width:100%;height:auto}
svg .t{font:600 14px sans-serif;text-anchor:middle;fill:var(--fg)}svg .s{font:12px sans-serif;text-anchor:middle;fill:var(--mut)}
svg .l{font:12px sans-serif;text-anchor:middle;fill:var(--fg)}svg .side{font:12px sans-serif;fill:var(--mut)}
svg .note{font:12.5px sans-serif;fill:var(--mut)}
svg rect.k{fill:var(--k);stroke:var(--kS)}svg rect.r{fill:var(--r);stroke:var(--rS)}svg rect.io{fill:var(--io);stroke:var(--ioS)}
svg rect.c{fill:var(--c);stroke:var(--cS)}svg rect.p{fill:var(--p);stroke:var(--pS)}svg rect.m{fill:var(--c);stroke:var(--fg);stroke-width:2.2}svg rect{stroke-width:1.5}
svg path.w2{stroke:var(--mut);stroke-width:1.2;stroke-dasharray:5 4}svg line.w{stroke:var(--fg);stroke-width:1.4}svg line.w2{stroke:var(--mut);stroke-width:1.2;stroke-dasharray:5 4}
svg line.w3{stroke:var(--kS);stroke-width:1.2;stroke-dasharray:2 3}svg line.wbold{stroke:var(--ioS);stroke-width:4}
svg .ah{fill:var(--mut)}svg rect.pickbox{fill:none;stroke:var(--ioS);stroke-width:2.5;stroke-dasharray:7 5}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;font:13px/1.45 ui-monospace,Menlo,monospace}
code{background:var(--code);padding:1px 4px;border-radius:4px;font-size:.92em}
table{border-collapse:collapse;width:100%;font-size:14.5px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}th{background:var(--card)}
.pick{background:var(--io)}.tag{display:inline-block;font-size:12px;border-radius:999px;padding:1px 9px;border:1px solid var(--line)}
.done{background:var(--io)}.next{background:var(--k)}.later{background:var(--p)}
ul.tight li{margin:.25em 0}
"""


def page(sections: list[tuple[str, str]], verdict: str) -> str:
    body = "".join(f'<h2 id="s{i}">{html.escape(h)}</h2>{c}' for i, (h, c) in enumerate(sections, 1))
    toc = " · ".join(f'<a href="#s{i}">{html.escape(h)}</a>' for i, (h, _) in enumerate(sections, 1))
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Joint Controllers Design</title><style>{CSS}</style></head><body><main>'
            f'<p style="color:var(--mut)">2026-11-27 · from Daily Note “joint controllers” · robot_sdk</p>'
            f'<h1>Joint controllers: composed boxes over one bus</h1><div class="verdict">{verdict}</div>'
            f'<p style="font-size:14px">{toc}</p>{body}</main></body></html>')


def main() -> None:
    capture = html.escape(read("joint_controllers_pick_cell.txt", "(capture missing)"))
    sections_extra = read("joint_controllers_sections.html")
    transmission = read("joint_controllers_transmission.html", "<p>(pending)</p>")
    remaining = read("joint_controllers_remaining.html", "<p>(pending)</p>")
    verdict = read("joint_controllers_verdict.html", "").strip()
    parts = {
        "STACK": stack_diagram(), "COMPOSITION": composition_diagram(), "BINDING": binding_diagram(),
        "COLLISION": collision_diagram(), "TXDIAG": transmission_diagram(), "CAPTURE": capture, "TRANSMISSION": transmission, "REMAINING": remaining,
    }
    parts["TXDIAG"] = parts.pop("TXDIAG")
    arm = read("joint_controllers_arm.html")
    for k, v in arm_diagrams().items():
        arm = arm.replace("{{" + k + "}}", v)
    parts["ARM"] = arm
    for key, value in parts.items():
        sections_extra = sections_extra.replace("{{" + key + "}}", value)
    sections = []
    for chunk in sections_extra.split("<!--SECTION ")[1:]:
        head, content = chunk.split("-->", 1)
        sections.append((head.strip(), content))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page(sections, verdict))
    print(OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
