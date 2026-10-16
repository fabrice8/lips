//! RFC-006 L1 exit check, tier B: the demo's native bundle in the REAL Lynx
//! engine (4.1, `libLynx_clay`), headless, through lynx-stack's
//! `lynx-headless-rust-test-runner`.
//!
//! What this proves that tier A cannot: Lynx's own threads and JS engines,
//! its own Element PAPI and event dispatch, and its native CSS engine
//! matching the classes the binding sets.
//!
//!   lips-tierb <main.lynx.bundle> <screenshot.bmp>

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

fn tap(page: &mut LynxPage, selector: &str) -> R<()> {
  page
    .locator(selector)?
    .ok_or_else(|| format!("no element for {selector}"))?
    .tap()?;
  Ok(())
}

fn main() -> R<()> {
  let mut args = std::env::args().skip(1);
  let bundle = args.next().ok_or("usage: lips-tierb <bundle> <screenshot.bmp>")?;
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

  // First render: produced on the background thread, applied by the main thread
  let dom = wait_dom(&mut page, "first render", |c| c.contains(&text("Count: 0")))?;
  check("first render from the background thread", true, String::new());
  check(
    "elements map to Lynx: div→view, p→text, raw text inside text",
    dom.contains("<view class=\"app\">") && dom.contains("<text id=\"count\""),
    dom.clone(),
  );
  check("keyed list renders in order", in_order(&dom, &["one", "two"]), dom.clone());
  check("no markers or stray text reach the engine", !dom.contains("<raw-text text=\"\n"), dom.clone());

  // Taps: main-thread listener → background handler → ops → main thread
  tap(&mut page, "#inc")?;
  wait_dom(&mut page, "Count: 1", |c| c.contains(&text("Count: 1")))?;
  tap(&mut page, "#inc")?;
  wait_dom(&mut page, "Count: 2", |c| c.contains(&text("Count: 2")))?;
  check("tap round-trips through both threads (×2)", true, String::new());

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

  // Native CSS: the classes the applier set, matched by Lynx's own engine
  let style = page.locator("#inc")?.ok_or("no #inc")?.computed_style_map()?;
  let bg = style.get("background-color").cloned().unwrap_or_default();
  check(
    "native CSS matches the class the binding set (.btn background)",
    bg.contains("226") || bg.to_lowercase().contains("e2e8f0"),
    format!("background-color = {bg:?}"),
  );
  let title = page.locator("#count")?.ok_or("no #count")?.computed_style_map()?;
  let size = title.get("font-size").cloned().unwrap_or_default();
  check("native CSS: .title font-size", size.starts_with("20"), format!("font-size = {size:?}"));

  page.screenshot(ScreenshotOptions {
    path: Some(shot.into()),
    settle: Duration::from_millis(100),
  })?;

  println!("{}", if failed == 0 { "\nall checks passed" } else { "\nSOME CHECKS FAILED" });
  std::process::exit(if failed == 0 { 0 } else { 1 })
}
