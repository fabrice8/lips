//! RFC-006 L1–L3 exit checks, tier B: the demo's native bundle in the
//! REAL Lynx engine (4.1, `libLynx_clay`), headless, through lynx-stack's
//! `lynx-headless-rust-test-runner`.
//!
//! What this proves that tier A cannot: Lynx's own threads and JS engines,
//! its own Element PAPI and event dispatch, its native CSS engine matching
//! the compiled sheet and resolving the variables Lips binds, and its
//! native input, scroll view and list.
//!
//!   lips-tierb <main.lynx.bundle> <screenshot.bmp>
//!   lips-tierb probe <main.lynx.bundle> <step>...

use lynx_headless_rust_test_runner::{
  ContainerOptions, GotoOptions, LynxContainer, LynxPage, ScreenshotOptions,
};
use std::time::{Duration, Instant};

type R<T> = Result<T, Box<dyn std::error::Error>>;

/// Poll the DOM until `ok` holds, or time out with the last content seen
fn wait_dom(page: &mut LynxPage, what: &str, ok: impl Fn(&str) -> bool) -> R<String> {
  let deadline = Instant::now() + Duration::from_secs(10);
  loop {
    let content = page.content()?;
    if ok(&content) {
      return Ok(content);
    }
    if Instant::now() > deadline {
      return Err(format!("timed out waiting for {what}; DOM: {content}").into());
    }
    page.wait_for_timeout(Duration::from_millis(50));
  }
}

fn text(s: &str) -> String {
  format!("text=\"{s}\"")
}

/// `needles` appear in this order
fn in_order(content: &str, needles: &[&str]) -> bool {
  let mut from = 0;
  for n in needles {
    match content[from..].find(&text(n)) {
      Some(i) => from += i + 1,
      None => return false,
    }
  }
  true
}

type Style = std::collections::BTreeMap<String, String>;

fn style(page: &mut LynxPage, selector: &str) -> R<Style> {
  Ok(page.locator(selector)?.ok_or_else(|| format!("no element for {selector}"))?.computed_style_map()?)
}

fn get<'a>(style: &'a Style, prop: &str) -> &'a str {
  style.get(prop).map(String::as_str).unwrap_or("")
}

/// What app.lips.css binds: `--accent` on .title, padding on the root, radius on .btn, width on .swatch
fn binds(page: &mut LynxPage) -> R<Vec<String>> {
  Ok(vec![
    get(&style(page, "#count")?, "color").to_string(),
    get(&style(page, ".app")?, "padding-left").to_string(),
    get(&style(page, "#inc")?, "border-radius").to_string(),
    get(&style(page, "#swatch")?, "width").to_string(),
  ])
}

/// Poll until `ok` holds; false on time out
fn wait_for(page: &mut LynxPage, _what: &str, ok: impl Fn(&mut LynxPage) -> R<bool>) -> R<bool> {
  let deadline = Instant::now() + Duration::from_secs(10);
  while Instant::now() < deadline {
    if ok(page)? {
      return Ok(true);
    }
    page.wait_for_timeout(Duration::from_millis(50));
  }
  Ok(false)
}

/// The list cells the engine has, by label, in tree order
fn cells(dom: &str) -> Vec<u32> {
  dom
    .split("text=\"item ")
    .skip(1)
    .filter_map(|s| s.split('"').next()?.parse().ok())
    .collect()
}

/// The centre of an element, in view pixels
fn centre(page: &mut LynxPage, selector: &str) -> R<(f64, f64)> {
  let b = page.locator(selector)?.ok_or_else(|| format!("no element for {selector}"))?.bounding_box()?;
  Ok((b.x + b.width / 2.0, b.y + b.height / 2.0))
}

fn pointer(page: &mut LynxPage, phase: lynx::sys::lynx_pointer_phase_e, x: f64, y: f64) {
  page.view().renderer().send_pointer_event(lynx::PointerEvent {
    phase,
    x,
    y,
    device_kind: lynx::sys::kLynxPointerDeviceKindTouch,
    buttons: 1,
    ..Default::default()
  });
  page.wait_for_timeout(Duration::from_millis(16));
}

/// A finger down on the element, moved by `dy`, then lifted: what a user's scroll is
fn drag(page: &mut LynxPage, selector: &str, dy: f64) -> R<()> {
  let (x, y) = centre(page, selector)?;
  pointer(page, lynx::sys::kLynxPointerPhaseDown, x, y);
  for i in 1..=10 {
    pointer(page, lynx::sys::kLynxPointerPhaseMove, x, y + dy * i as f64 / 10.0);
  }
  pointer(page, lynx::sys::kLynxPointerPhaseUp, x, y + dy);
  Ok(())
}

/// A finger tap where the element is: hit-tested like a user's, so it focuses inputs
fn touch(page: &mut LynxPage, selector: &str) -> R<()> {
  let (x, y) = centre(page, selector)?;
  pointer(page, lynx::sys::kLynxPointerPhaseDown, x, y);
  pointer(page, lynx::sys::kLynxPointerPhaseUp, x, y);
  Ok(())
}

fn tap(page: &mut LynxPage, selector: &str) -> R<()> {
  page
    .locator(selector)?
    .ok_or_else(|| format!("no element for {selector}"))?
    .tap()?;
  Ok(())
}

/// `lips-tierb probe <bundle> <step>...` — explore what the engine does,
/// without writing checks. Steps run in order:
///   tap=<selector>                 tap, then let the threads settle
///   style=<selector>[:prop,prop]   the computed style, or some properties of it
///   dom                            the engine's DOM
///   box=<selector>                 its bounding box
///   touch=<selector>               a hit-tested finger tap (focuses inputs)
///   drag=<selector>:<dy>           a finger drag, as a user scrolls
///   shot=<file.bmp>                a screenshot
fn probe(bundle: &str, steps: &[String]) -> R<()> {
  let container = LynxContainer::new(ContainerOptions { width: 400, height: 600, ..ContainerOptions::default() })?;
  let mut page = container.new_page()?;
  page.goto(bundle, GotoOptions::default())?;
  page.wait_for_timeout(Duration::from_millis(300));
  for step in steps {
    let (kind, arg) = step.split_once('=').unwrap_or((step.as_str(), ""));
    match kind {
      "tap" => {
        tap(&mut page, arg)?;
        page.wait_for_timeout(Duration::from_millis(300));
      }
      "style" => {
        let (selector, props) = arg.split_once(':').unwrap_or((arg, ""));
        let style = page.locator(selector)?.ok_or_else(|| format!("no element for {selector}"))?.computed_style_map()?;
        for (k, v) in &style {
          if props.is_empty() || props.split(',').any(|p| p == k) {
            println!("{selector} {k}: {v}");
          }
        }
      }
      "dom" => println!("{}", page.content()?),
      "box" => {
        let b = page.locator(arg)?.ok_or_else(|| format!("no element for {arg}"))?.bounding_box()?;
        println!("{arg} box: x={} y={} w={} h={}", b.x, b.y, b.width, b.height);
      }
      "touch" => {
        touch(&mut page, arg)?;
        page.wait_for_timeout(Duration::from_millis(300));
      }
      "drag" => {
        let (selector, dy) = arg.split_once(':').ok_or("drag=<selector>:<dy>")?;
        drag(&mut page, selector, dy.parse()?)?;
        page.wait_for_timeout(Duration::from_millis(500));
      }
      "shot" => {
        page.screenshot(ScreenshotOptions { path: Some(arg.into()), settle: Duration::from_millis(100) })?;
      }
      _ => return Err(format!("unknown step {step}").into()),
    }
  }
  Ok(())
}

fn main() -> R<()> {
  let mut args = std::env::args().skip(1);
  let bundle = args.next().ok_or("usage: lips-tierb <bundle> <screenshot.bmp>")?;
  if bundle == "probe" {
    let bundle = args.next().ok_or("usage: lips-tierb probe <bundle> <step>...")?;
    return probe(&bundle, &args.collect::<Vec<_>>());
  }
  let shot = args.next().ok_or("usage: lips-tierb <bundle> <screenshot.bmp>")?;

  let container = LynxContainer::new(ContainerOptions {
    width: 400,
    height: 600,
    ..ContainerOptions::default()
  })?;
  let mut page = container.new_page()?;
  page.goto(&bundle, GotoOptions::default())?;

  let mut failed = 0;
  let mut check = |name: &str, ok: bool, detail: String| {
    println!("{} {name}{}", if ok { "✓" } else { "✗" }, if ok { String::new() } else { format!("  {detail}") });
    if !ok {
      failed += 1;
    }
  };

  // lips#44: pluginLips encodes Android's accessibility path into the page config
  let encoded = std::fs::read(&bundle)?;
  check(
    "the bundle's page config selects Android's accessibility path (enableA11y)",
    { let flag = b"\"enableA11y\":true"; encoded.windows(flag.len()).any(|w| w == flag) },
    String::new(),
  );

  // First render: produced on the background thread, applied by the main thread
  let dom = wait_dom(&mut page, "first render", |c| c.contains(&text("Count: 0")))?;
  check("first render from the background thread", true, String::new());
  check(
    "elements map to Lynx: div→view, p→text, raw text inside text",
    dom.contains("<view class=\"app") && dom.contains("<text id=\"count\""),
    dom.clone(),
  );
  check("keyed list renders in order", in_order(&dom, &["one", "two"]), dom.clone());
  check("no markers or stray text reach the engine", !dom.contains("<raw-text text=\"\n"), dom.clone());
  // RFC-006 §4.8: ARIA reaches the engine as Lynx's own attributes
  let inc = dom.split("<view id=\"inc\"").nth(1).and_then(|s| s.split('>').next()).unwrap_or("");
  check(
    "a <button> reaches the engine as a button named by its content (+1)",
    inc.contains("accessibility-traits=\"button\"") && inc.contains("accessibility-label=\"+1\""),
    inc.to_string(),
  );

  // Taps: main-thread listener → background handler → ops → main thread
  tap(&mut page, "#inc")?;
  wait_dom(&mut page, "Count: 1", |c| c.contains(&text("Count: 1")))?;
  tap(&mut page, "#inc")?;
  wait_dom(&mut page, "Count: 2", |c| c.contains(&text("Count: 2")))?;
  check("tap round-trips through both threads (×2)", true, String::new());

  // lips#41: Lynx does not block a disabled button's tap; Lips drops it. Both kinds of tap
  touch(&mut page, "#off")?;
  tap(&mut page, "#off")?;
  page.wait_for_timeout(Duration::from_millis(300));
  let dom = page.content()?;
  let off = dom.split("<view id=\"off\"").nth(1).and_then(|s| s.split('>').next()).unwrap_or("").to_string();
  check(
    "a disabled button's tap reaches no handler, and it reads as disabled",
    dom.contains(&text("Count: 2")) && off.contains("accessibility-value=\"disabled\"") && !off.contains(" disabled="),
    format!("{off} / count 2: {}", dom.contains(&text("Count: 2"))),
  );

  tap(&mut page, "#add")?;
  let dom = wait_dom(&mut page, "row 3", |c| c.contains(&text("row 3")))?;
  check("keyed insert", in_order(&dom, &["one", "two", "row 3"]), dom.clone());

  tap(&mut page, "#rev")?;
  let dom = wait_dom(&mut page, "reversed rows", |c| in_order(c, &["row 3", "two", "one"]))?;
  check("keyed reverse moves rows", true, String::new());
  check(
    "moved rows keep their identity (same data-id order)",
    dom.find("data-id=\"3\"") < dom.find("data-id=\"2\"") && dom.find("data-id=\"2\"") < dom.find("data-id=\"1\""),
    dom.clone(),
  );

  // RFC-006 L2: the component sheet (app.lips.css), compiled flat and
  // scoped by class at build time, matched by Lynx's own CSS engine
  check(
    "the scope class reaches the root (.lips-app)",
    dom.contains("class=\"app lips-app\""),
    dom.clone(),
  );
  let inc = style(&mut page, "#inc")?;
  let count = style(&mut page, "#count")?;
  check(
    "scoped rules apply (.btn background, .title font-size)",
    get(&inc, "background-color") == "rgb(226,232,240)" && get(&count, "font-size") == "20px",
    format!("background-color = {:?}, font-size = {:?}", get(&inc, "background-color"), get(&count, "font-size")),
  );
  check(
    "@media applies (enableCSSRule)",
    get(&count, "letter-spacing") == "1px",
    format!("letter-spacing = {:?}", get(&count, "letter-spacing")),
  );
  let item = style(&mut page, ".item")?;
  check(
    "text properties inherit from the root (enableCSSInheritance)",
    get(&item, "font-size") == "15px",
    format!("font-size = {:?}", get(&item, "font-size")),
  );

  // Binds: variables written inline on the root (enableCSSInlineVariables),
  // unit-suffixed ones carrying the unit — Lynx's calc() covers lengths only
  let before = binds(&mut page)?;
  check(
    "variable binds apply (accent, padding 16px, radius 6px, width 50%)",
    before == ["rgb(225,29,72)", "16px", "6px", "184px"],
    format!("{before:?}"),
  );
  tap(&mut page, "#theme")?;
  let after = wait_for(&mut page, "the theme", |p| Ok(binds(p)?[0] != before[0]))?;
  let after = if after { binds(&mut page)? } else { before.clone() };
  check(
    "a state change rewrites them (blue, 24px, 12px, 80%)",
    after == ["rgb(37,99,235)", "24px", "12px", "281.6px"],
    format!("{after:?}"),
  );

  // #34: an inline svg is ONE engine element, its subtree in `content`,
  // sized by its width and height. The runner does not integrate the svg
  // XElement, so what it draws is tier C
  let dom = page.content()?;
  let icon = dom.split("<svg id=\"icon\"").nth(1).unwrap_or("").to_string();
  let b = page.locator("#icon")?.ok_or("no #icon")?.bounding_box()?;
  check(
    "an inline svg reaches the engine as one element: its markup in content, the bound fill after a state change, 24×24",
    icon.contains("content=\"<svg viewBox=\"0 0 24 24\"") && icon.contains("fill=\"#2563eb\"></rect></svg>")
      && !icon.starts_with("><rect") && b.width == 24.0 && b.height == 24.0,
    format!("{} box {}×{}", &icon[..icon.len().min(160)], b.width, b.height),
  );

  // RFC-006 L3: the vocabulary pass, inputs, the scroll view, the list
  let has = |page: &mut LynxPage, needle: String| wait_for(page, &needle.clone(), move |p| Ok(p.content()?.contains(&needle)));
  check(
    "bare text in a button renders: wrapped in a text element at compile time",
    dom.contains(&format!("<text><raw-text {}>", text("fill"))),
    dom.clone(),
  );

  let first = cells(&dom);
  check(
    "a list builds only the cells in view (its header and items 1–4 of 40)",
    first == [1, 2, 3, 4],
    format!("{first:?}"),
  );
  // lips#43: the header's hints reach the engine's list. That this engine sticks it is not
  // checked: the headless runtime does not, nor applies span-count (RFC-006 §4.5, "As built, cell hints")
  let head = dom.split("<list-item id=\"head\"").nth(1).and_then(|s| s.split('>').next()).unwrap_or("").to_string();
  let feed = dom.split("<list id=\"feed\"").nth(1).unwrap_or("");
  check(
    "a list-item full-span sticky-top is the list's first cell, with its hints, in a sticky list",
    head.contains("full-span=\"true\"") && head.contains("sticky-top=\"true\"")
      && feed.split('>').next().unwrap_or("").contains("sticky=\"true\"")
      && feed.find("id=\"head\"") < feed.find(&text("item 1")),
    head,
  );

  // fill → setValue on the native input → its `input` event → `e.target.value`
  tap(&mut page, "#fill")?;
  let typed = has(&mut page, text("Typed: hello"))?;
  check("an input's value goes in through setValue, and its input event comes back", typed, page.content()?);

  // #35: a touch's points and its target's dataset reach the background
  touch(&mut page, "#swatch")?;
  let touched = wait_for(&mut page, "the touch", |p| Ok(p.content()?.contains(" on swatch\""))).unwrap_or(false);
  let dom = page.content()?;
  let x: f64 = dom.split("Touch: ").nth(1).and_then(|s| s.split(' ').next()).and_then(|n| n.parse().ok()).unwrap_or(-1.0);
  check(
    "a touch carries its points and its target's dataset to the background (e.touches[0].clientX, e.currentTarget.dataset)",
    touched && x > 0.0 && x < 400.0,
    format!("clientX {x}"),
  );

  // #36: .stop is Lynx's catch, .outside a capture listener on the page, both with real hit-tested touches
  let taps = |p: &mut LynxPage| -> R<(u32, u32)> {
    let dom = p.content()?;
    let s = dom.split("text=\"Row: ").nth(1).unwrap_or("").split('"').next().unwrap_or("").to_string();
    let mut n = s.split(" Outside: ").map(|x| x.parse::<u32>().unwrap_or(9999));
    Ok((n.next().unwrap_or(9999), n.next().unwrap_or(9999)))
  };
  let (row0, out0) = taps(&mut page)?;
  touch(&mut page, "#shuffle")?;
  wait_for(&mut page, "the row's tap", |p| Ok(taps(p)?.0 == row0 + 1))?;
  touch(&mut page, "#fill")?;
  wait_for(&mut page, "fill's tap", |p| Ok(p.content()?.contains(&text("Typed: hello"))))?;
  page.wait_for_timeout(Duration::from_millis(300));
  let (row1, out1) = taps(&mut page)?;
  check(
    "on-click.stop keeps a tap from the row (Lynx's catch): shuffle reaches it, fill does not",
    row1 == row0 + 1 && out1 == out0,
    format!("row {row0} → {row1}, outside {out0} → {out1}"),
  );
  touch(&mut page, "#count")?;
  let outside = wait_for(&mut page, "the outside tap", |p| Ok(taps(p)?.1 == out1 + 1))?;
  check("on-click.outside runs for a tap elsewhere on the page, not for one inside", outside, format!("{:?}", taps(&mut page)?));
  tap(&mut page, "#shuffle")?; // back to 1–40 for the list checks below
  wait_for(&mut page, "the list back in order", |p| Ok(cells(&p.content()?).starts_with(&[1])))?;

  // #37: element references. focus() reaches the native input, whose own focus event comes back
  tap(&mut page, "#focus")?;
  let focused = has(&mut page, text("Focused: 1"))?;
  check("a ref's focus() focuses the native input (its focus event comes back)", focused, page.content()?);

  drag(&mut page, "#scroller", -150.0)?;
  let top = has(&mut page, text("Top: 150"))?;
  check("a bare scroll-y scrolls, and scroll events reach the background (Top: 150)", top, page.content()?);

  tap(&mut page, "#jump")?;
  let jumped = has(&mut page, text("Top: 60"))?;
  check("a ref's scrollTo({ top: 60 }) scrolls the native scroll view", jumped, page.content()?);

  tap(&mut page, "#measure")?;
  let measured = has(&mut page, text("Rect: 120×30"))?;
  // On failure, what the page shows: `none` when the engine answered without a box, empty when it never answered
  let shown = page.content()?;
  let shown = shown.find("text=\"Rect:").map_or(String::from("no Rect line"), |at| shown[at..].chars().take(40).collect());
  check("a ref's getBoundingClientRect() answers from the engine, for a layout-only box", measured, shown);

  tap(&mut page, "#shuffle")?;
  let shuffled = wait_for(&mut page, "the reorder", |p| Ok(cells(&p.content()?).ends_with(&[40, 39, 38, 37])))?;
  check(
    "a reordered list asks again for the cells in view (items 40–37, under its header)",
    shuffled,
    format!("{:?}", cells(&page.content()?)),
  );

  drag(&mut page, "#feed", -200.0)?;
  let more = wait_for(&mut page, "more cells", |p| Ok(cells(&p.content()?).contains(&30)))?;
  check(
    "dragging the list asks for the cells it scrolls into view",
    more,
    format!("{:?}", cells(&page.content()?)),
  );

  page.screenshot(ScreenshotOptions {
    path: Some(shot.into()),
    settle: Duration::from_millis(100),
  })?;

  println!("{}", if failed == 0 { "\nall checks passed" } else { "\nSOME CHECKS FAILED" });
  std::process::exit(if failed == 0 { 0 } else { 1 })
}
