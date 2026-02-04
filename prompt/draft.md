---
describe: building a plan markdown and tickets for work we are about to do
---

# draft-the-plan

drafing a plan or DRAFT-PLAN is a planning phase involving a lot of thinking about problems and researching.

# plan-philosophy

## using many systems architectures views to let us start to look at the problem across many dimensions

looking at component architectures, and data-flows of the system, and in general presenting ideas for what the structure of the final system might look like. we need to start with a comprehensive view of what the problem really is, doing initial research on the related technologies and libraries to establish a good starting point.

## conceptualization not concretization

our goal is not yet to be absolutely sure, uncertainty and more importantly possibility is to be regarded & given respect.

## creating descriptive and visually iconic short-names

we want to be creating and re-using visually distinct SHORT-NAMES for aspects of our system as we go. we want to breed familiarity and be clear that we are referring to the same thing.

## a good plan is the heart of the work

this sub-prompt is a- perhaps THE- heart of the `rekon` prompt system of which it is a part. ideas flow from drafting plans, and it is where many SHORT-NAMES are often begat. drafting a plan is not set in stone, and indeed, we want to try to encourage and leave lots of wiggle room, leave a long trail of how we got where we were (a WORK LOG), while still maintaining overall conceise easy to drop into topics when we build the initial DRAFT and then REFINE THE DRAFT.

# plan-process

- create a plan as a `/doc/plan/<plan-name>.md` that covers our prompt, research, and design/architecture, and exploration areas, and what the early plan is.
- we need a good short-name for the plan that can be up to about 8 words, that describes the thing we're going to make.
- propose the plan plan to the user and refine the plan with them
- once you have approval, create a @general subagent to build a `<plan-name>.summary.md` file next to the plan. have it review the work. after evaluating and writing the summary, append to the summary a review of what areas of the plan seem most clear and fleshed out, and which seem like they need the most refinement. then write a core concepts section that talks to the main ideas of the plan again.
- WRITE-THE-TICKETS

## refine-the-draft

drafting a plan implicitly carries with it the implication that we are going to refine the plan. the work of drafting a plan is tentative, meant to build a good picture of the world, that we can assess and work on.

some elements of the plan might need revising. having a stream of commits made during the plan will help insure maximum flexibility in revising, allowing us to re-do specific narrow bits of work, allowing us to drop changes that, latter, we find not to be appropriate.

## write-the-ticket

**ticket creation strategy:**

1. create epics first (logical groupings based on PLAN's component architecture)
2. tickets should use short-names in their IDs and titles.
3. auto-generated id's will not be human friendly & will be hard to rename latter, so use good short-names. Avoid the "rename trap" - once tickets have IDs, renaming them all is painful and error-prone
4. child ticket id's should start with their parent ticket id. We create deeper and deeper nesting / prefixes as we go.

**ticket content:**

- describe the actual feature/subsystem, NOT "research about X"
- include components, API goals, and use cases
- give various components short-names for cross-referencing
- crosslink tickets with beads deps and inline links

- create tickets EARLY and UPDATE them regularly as your understanding evolves.
- rework tickets as you go
- giving the various components a short-name, a descriptive label is VERY HELPFUL. ticket titles should often begin with a SHORT-NAME for the ticket.
- ticket id's should always be well thought out, and make use of the short-names that they represent or refer to.
- when updating tickets, favor adding to the ticket over replacing the ticket description.
- previous tickets are not always correct in what they project: we must UPDATE OUR PRIORS by making new statements in the ticket declaring what has changed since the original statement.
- capture implications and assessments as items inside ticket descriptions.

### beads tickets technical notes

- beads has two state stores:
  - the `.beads/issues.jsonl` is what gets checked in
  - there is a `.beads/beads.db` sqlite database where many changes happen, but this file is in `.beads/.gitignore` and not tracked.
- `bd export -o .beads/issues.jsonl` will send the current database to the issues.jsonl
- `bd import -i .beads/issues.jsonl` will send all issues.jsonl into the database.

# short-name

short-names are brief couple-word phrases used to describe things. good things to have short-names for:

- concepts
- topics
- pieces of the system structure
- problems
- solutions
- techniques
- data flows / streams
- inputs / outputs / parameters / arguments
- test suites
- build artifacts
- deployment tools and artifacts

short names can come in many forms. these are all equivalent:

- SHORT-NAME (canonical form; the LLM should use this when writing short-names)
- SHORT NAME
- short-name
- short name (this should be converted to short-name for clarity)

if the user or prompt says CAPITAL-WORDS, they are almost certainly saying a short-name. this is done as an affordance for other readers of the document other than you the LLM, to help other consumers understand that this is a key word, that if there is a glossary it probably will be found there. it is a hyperlink internal to the textual world of this project. the axiomatics of the url is the ascendant spiritual creation far above the rekon prompt system, that inspires it, that is the pump of the beating heart that is rekon. we want to be increasing the hypermedia referentiality of the rekon system by referring to things by their SHORT NAMES.

markdown headers often indirectly imply a corresponding short-name, or sometimes they directly embody the short name. using short-names in markdown is encouraged!

proactively create names for things. this gives the developer and the LLM stable identifiers to talk to. short-names are absolutely the pinnacle of `rekon` the prompt system to be good with short-names. work with your user to formulate good names, to make sure the naming is right and fits good. alternate naming thoughts are great when drafting a plan you will be asked to rename sometimes: create a commit before doing so of current work that has been done, then create a subagent to do the renaming. create

short names might not always have the same conjugation. short names for example still refers to short-name.

rather than strict semantic terms, we strive to accomodate user intent, and be intelligent and liberal with what we regard as a short name when we go about. this section for example has a header of short-name and is the short name, is explicitly itself a short-name. the author could also have written SHORT-NAME which would have been more explicit. if the user has an all caps hypenated word it is (almost) _definitely_ a short-name. sometimes they might put a hash tag in front of it, sometimes they might put it in quotes: all variants are acceptable. the present of the all-capitals hypenated word is sufficient & is the actual short-name. in the rare case that there is are ever more than one hash tags, the short name includes all but the first hash tag, but the first hash is always ignored when regarding a short-name, as are surrounding parenthesis.

### ticket subject hygenics (#TICKET-HYGENE)

you are encouraged to make use of short-names when referring to things in general, and especially in beads tickets, in their ticket id's, in their ticket titles, and their ticket descriptions. and in git commits!

beads ticket id's and descriptions should reflect the short-names. if there is a short name topic, prefix the ticket with the short name as a topic, like this: `<short-name>:`.

# create a commit (CREATE-COMMIT)

- creating a commit means using `jj commit -m`.
- to create a commit, create a robustly helpful guiding informative ticket, with an excellent first `-m` which is the SUBJECT LINE. then craft more `-m`'s to fill out the rest of the ticket.
- update tickets before making a commit! we want the updated ticket to be in the commit.
- i want to stress that you should not use `jj describe` unless you are certain that you want to be revising an existing commit's description: it does not create a commit, it only updates the previous description. if you use jj commit, you will create a linear straight through path of commits; the alternative risks leaving the JJ-PATH, risks leaving the smooth path of jj, which is extremely hazardous HERE-BE-DRAGONS territory, and will create a difficult to reconcile git history that will cause significant suffering and devleoper misery to revise and shape back into the smooth path. sometimes the developer might ask you to work with branches or do other jj tasks that violate this

# glossary

the user might ask you to update the glossary, which is an optional section at the end of the `README.md`. create or update a table that has columns for the `short-name`, the `description`, and pertinent `tickets`.

# instruction

this document `draft-a-plan` is given to you to help start drafting a plan. these are generic instructions about that process and what is expected. if it remains unclear what to plan, do no planning. the user also has provided this guidance or instruction:

$ARGUMENTS
