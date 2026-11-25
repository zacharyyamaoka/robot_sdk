"""V4 Catalog journey: land on the Packages catalog, open the most-used type's row, filter Uses to it, expand a neighbour."""


def _open_type(page):
    page.click("[data-testid=tab-types]")
    page.wait_for_timeout(300)
    # Types sort by use count; JointTrajectory is the top row in today's graph.json.
    page.locator("[data-testid^='row-type:']", has_text="JointTrajectory").first.click()


def _filter_uses(page):
    page.click("[data-testid=panel-open-uses]")  # the type panel's "filter the Uses tab to JointTrajectory"
    page.wait_for_timeout(400)
    page.click("[data-testid='sort-uses-state']")
    page.wait_for_timeout(200)
    page.locator("[data-testid^='row-use:robot_controllers|']").first.click()


def _expand(page):
    btn = page.locator("[data-testid='ego-expand-pkg:robot_controllers']")
    btn.scroll_into_view_if_needed()
    btn.click()


def _directory(page):
    page.click("[data-testid=panel-close]")
    page.click("[data-testid=tab-packages]")
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    # hover the viewer's GitHub chip: every row carries Open › then GitHub · PyPI · README (Site where declared)
    page.locator("[data-testid='links-traj_compare'] a").first.hover()


def _graph(page):
    page.click("[data-testid=panel-close]")
    page.click("[data-testid=tab-packages]")
    page.click("[data-testid=pkg-view-graph]")
    page.wait_for_timeout(500)
    page.click("[data-testid='layer-toggle-leaf']")
    page.evaluate("document.querySelector('.pkg-graph').scrollIntoView({block: 'end'})")


STEPS = [
    {"label": "Land", "caption": "The landing page is the catalog: pitch, install and live counts on top, then 13 packages as rows grouped by layer, with traj_compare badged as a viewer and sorted last.", "act": None},
    {"label": "Open JointTrajectory", "caption": "Types tab, top row (58 uses): the side panel splits its users into producers, consumers and importers and draws them left, centre and right as a React Flow neighbourhood.", "act": _open_type, "wait": 1400},
    {"label": "Uses, declared or not", "caption": "One click filters the Uses tab to JointTrajectory's 58 rows; the state facet counts declared + verified against found-not-declared, and the opened row shows its kind, public flag and file:line.", "act": _filter_uses, "wait": 1400},
    {"label": "Expand a neighbour", "caption": "'+' on robot_controllers adds its own neighbours (its other types and what it requires) to the graph; '−' folds them back.", "act": _expand, "wait": 1400},
    {"label": "Directory: one click out", "caption": "Back on the Packages catalog every row, the traj_compare viewer included, ends in Open › (its types and uses here) then GitHub, PyPI and README, plus Site where the package declares one; the Agents table and every side panel carry the same links.", "act": _directory, "wait": 1200},
]
