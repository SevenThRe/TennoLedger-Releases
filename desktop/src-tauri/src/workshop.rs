use crate::collection::{count, Catalog, Item, Snapshot};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub item_id: String,
    pub needed: u64,
    pub owned: Option<u64>,
    pub allocated: Option<u64>,
    pub missing: Option<u64>,
    pub status: String,
    pub children: Vec<Node>,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Missing {
    pub item_id: String,
    pub quantity: u64,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreePlan {
    pub root: Node,
    pub blueprints: Vec<Missing>,
    pub resources: Vec<Missing>,
    pub unknown: Vec<String>,
    pub credits: Option<u64>,
    pub min_seconds: Option<u64>,
    pub max_seconds: Option<u64>,
}
struct Context<'a> {
    items: BTreeMap<&'a str, &'a Item>,
    snapshot: &'a Snapshot,
    stock: BTreeMap<String, u64>,
    unknown: BTreeSet<String>,
    missing: BTreeMap<String, u64>,
    credits: u64,
    total_time: u64,
    nodes: usize,
}
fn add(a: u64, b: u64) -> Result<u64, String> {
    a.checked_add(b).ok_or("制造需求溢出".into())
}
fn mul(a: u64, b: u64) -> Result<u64, String> {
    a.checked_mul(b).ok_or("制造需求溢出".into())
}
impl Context<'_> {
    fn visit(
        &mut self,
        id: &str,
        needed: u64,
        reusable: bool,
        path: &mut Vec<String>,
        root: bool,
    ) -> Result<(Node, u64), String> {
        self.nodes += 1;
        if self.nodes > 10000 || path.len() > 32 || path.iter().any(|s| s == id) {
            return Err("配方循环或超过树大小限制".into());
        }
        let owned = if root {
            Some(0)
        } else {
            count(self.snapshot, id)
        };
        let allocated = owned.map(|total| {
            let available = self.stock.entry(id.into()).or_insert(total);
            let n = needed.min(*available);
            if !reusable {
                *available -= n;
            }
            n
        });
        let missing = allocated.map(|a| needed - a);
        let mut node = Node {
            item_id: id.into(),
            needed,
            owned,
            allocated,
            missing,
            status: if missing == Some(0) {
                "owned"
            } else if missing.is_none() {
                "unknown"
            } else {
                "missing"
            }
            .into(),
            children: vec![],
        };
        if missing == Some(0) {
            return Ok((node, 0));
        }
        if owned.is_none() {
            self.unknown.insert(id.into());
        }
        let amount = missing.unwrap_or(needed);
        let recipe = self.items.get(id).and_then(|i| i.recipe.as_ref()).cloned();
        let Some(recipe) = recipe else {
            let old = *self.missing.get(id).unwrap_or(&0);
            self.missing.insert(id.into(), add(old, amount)?);
            return Ok((node, 0));
        };
        if recipe.output == 0 {
            return Err("配方产量为零".into());
        }
        let batches = amount.div_ceil(recipe.output);
        let duration = mul(recipe.seconds, batches)?;
        self.credits = add(self.credits, mul(recipe.credits, batches)?)?;
        self.total_time = add(self.total_time, duration)?;
        path.push(id.into());
        let mut child_times = BTreeMap::<String, u64>::new();
        let mut parts = Vec::<(String, (u64, bool))>::new();
        for p in &recipe.parts {
            let n = if p.reusable {
                p.quantity
            } else {
                mul(p.quantity, batches)?
            };
            let index = parts
                .iter()
                .position(|(id, _)| id == &p.item_id)
                .unwrap_or_else(|| {
                    parts.push((p.item_id.clone(), (0, p.reusable)));
                    parts.len() - 1
                });
            let entry = &mut parts[index].1;
            if entry.1 != p.reusable {
                return Err("同一物料可复用属性冲突".into());
            }
            entry.0 = if p.reusable {
                entry.0.max(n)
            } else {
                add(entry.0, n)?
            };
        }
        for (child, (n, reusable)) in parts {
            let (child_node, t) = self.visit(&child, n, reusable, path, false)?;
            let old = *child_times.get(&child).unwrap_or(&0);
            child_times.insert(child, add(old, t)?);
            node.children.push(child_node);
        }
        path.pop();
        if allocated.is_some() {
            let excess = mul(batches, recipe.output)? - amount;
            if excess > 0 {
                let old = *self.stock.get(id).unwrap_or(&0);
                self.stock.insert(id.into(), add(old, excess)?);
            }
        }
        if node.children.iter().any(|c| c.status == "unknown") {
            node.status = "unknown".into();
        } else if node
            .children
            .iter()
            .all(|c| c.status == "owned" || c.status == "craft")
        {
            node.status = "craft".into();
        }
        Ok((
            node,
            add(duration, child_times.values().copied().max().unwrap_or(0))?,
        ))
    }
}
pub fn build(c: &Catalog, s: &Snapshot, id: &str, quantity: u64) -> Result<TreePlan, String> {
    if quantity == 0 || quantity > 1000 {
        return Err("制造数量必须为 1–1000".into());
    }
    if !c.items.iter().any(|i| i.id == id && i.recipe.is_some()) {
        return Err("没有制造配方".into());
    }
    let mut ctx = Context {
        items: c.items.iter().map(|i| (i.id.as_str(), i)).collect(),
        snapshot: s,
        stock: BTreeMap::new(),
        unknown: BTreeSet::new(),
        missing: BTreeMap::new(),
        credits: 0,
        total_time: 0,
        nodes: 0,
    };
    let (root, min_time) = ctx.visit(id, quantity, false, &mut vec![], true)?;
    let exact = ctx.unknown.is_empty();
    let mut blueprints = vec![];
    let mut resources = vec![];
    for (id, quantity) in ctx.missing {
        if quantity > 0 {
            let target = if id.contains("Blueprint") {
                &mut blueprints
            } else {
                &mut resources
            };
            target.push(Missing {
                item_id: id,
                quantity,
            });
        }
    }
    Ok(TreePlan {
        root,
        blueprints,
        resources,
        unknown: ctx.unknown.into_iter().collect(),
        credits: exact.then_some(ctx.credits),
        min_seconds: exact.then_some(min_time),
        max_seconds: exact.then_some(ctx.total_time),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::collection::{Part, Recipe};
    fn item(id: &str, parts: Vec<(&str, u64, bool)>, seconds: u64) -> Item {
        Item {
            id: id.into(),
            name: id.into(),
            zh: id.into(),
            category: "component".into(),
            prime: false,
            mastery_req: 0,
            max_rank: 0,
            xp_per_rank: 0,
            vaulted: None,
            recipe: Some(Recipe {
                output: 1,
                credits: 10,
                seconds,
                parts: parts
                    .into_iter()
                    .map(|(id, quantity, reusable)| Part {
                        item_id: id.into(),
                        quantity,
                        reusable,
                    })
                    .collect(),
            }),
        }
    }
    fn snapshot() -> Snapshot {
        Snapshot {
            complete: true,
            ..Default::default()
        }
    }
    #[test]
    fn shared_stock_is_not_double_spent() {
        let c = Catalog {
            items: vec![
                item("root", vec![("a", 1, false), ("b", 1, false)], 10),
                item("a", vec![("ore", 2, false)], 20),
                item("b", vec![("ore", 2, false)], 30),
            ],
        };
        let mut s = snapshot();
        s.counts.insert("ore".into(), 3);
        let p = build(&c, &s, "root", 1).unwrap();
        assert_eq!(p.resources[0].quantity, 1);
        assert_eq!(p.credits, Some(30));
        assert_eq!(p.min_seconds, Some(40));
        assert_eq!(p.max_seconds, Some(60));
        assert_eq!(s.counts["ore"], 3);
    }
    #[test]
    fn owned_subassembly_prunes_cost() {
        let c = Catalog {
            items: vec![
                item("root", vec![("a", 1, false)], 10),
                item("a", vec![("ore", 2, false)], 20),
            ],
        };
        let mut s = snapshot();
        s.counts.insert("a".into(), 1);
        let p = build(&c, &s, "root", 1).unwrap();
        assert!(p.resources.is_empty());
        assert!(p.root.children[0].children.is_empty());
        assert_eq!(p.credits, Some(10));
    }
    #[test]
    fn reusable_blueprint_does_not_multiply() {
        let c = Catalog {
            items: vec![item("root", vec![("ReusableBlueprint", 1, true)], 10)],
        };
        let mut s = snapshot();
        s.counts.insert("ReusableBlueprint".into(), 1);
        let p = build(&c, &s, "root", 5).unwrap();
        assert!(p.blueprints.is_empty());
        assert_eq!(p.credits, Some(50));
    }
    #[test]
    fn output_surplus_reused_between_branches() {
        let mut batch = item("batch", vec![("ore", 1, false)], 10);
        batch.recipe.as_mut().unwrap().output = 2;
        let c = Catalog {
            items: vec![
                item("root", vec![("a", 1, false), ("b", 1, false)], 10),
                item("a", vec![("batch", 1, false)], 10),
                item("b", vec![("batch", 1, false)], 10),
                batch,
            ],
        };
        let p = build(&c, &snapshot(), "root", 1).unwrap();
        assert_eq!(p.resources[0].quantity, 1);
    }
    #[test]
    fn partial_inventory_never_reports_exact_totals() {
        let c = Catalog {
            items: vec![item("root", vec![("ore", 1, false)], 10)],
        };
        let p = build(&c, &Snapshot::default(), "root", 1).unwrap();
        assert!(p.credits.is_none());
        assert_eq!(p.unknown, vec!["ore"]);
    }
    #[test]
    fn cycles_rejected() {
        let c = Catalog {
            items: vec![item("root", vec![("root", 1, false)], 10)],
        };
        assert!(build(&c, &snapshot(), "root", 1).is_err());
    }
}
