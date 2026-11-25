# Round-2 brief: Zach's feedback on round 1 (verbatim)

Source: /home/bam/zach_brain/Sources/Daily Notes/Daily Note - Nov 24 2026.md, lines 2740-2826 (2026-11-24 ~20:30 MST).
Images he pasted (Read them — they show exactly what he means):
- /home/bam/zach_brain/Sources/Images/Pasted image 20261124203022.png
- /home/bam/zach_brain/Sources/Images/Pasted image 20261124203341.png
- /home/bam/zach_brain/Sources/Images/Pasted image 20261124203415.png
- /home/bam/zach_brain/Sources/Images/Pasted image 20261124203537.png
- /home/bam/zach_brain/Sources/Images/Pasted image 20261124203759.png
- /home/bam/zach_brain/Sources/Images/Pasted image 20261124203929.png

Image map: 203022 = round-1 V1 Layer Atlas stack (loved; edge routing into robot_msgs); 203341 = V1's checkbox row (imports / package deps / agents) where 'group by layer' goes; 203415 = V1 'The layers' directory cards; 203537 = V5 compact Directory (plus its Health map nav); 203759 = GitHub's Switch branches/tags picker (the model for the version picker); 203929 = V2 Type Switchboard, JointTrajectory focused (loved).

```text
>     - prior art: [[C - Copy-In Template vs Pinned Package]].
> - Chat: [[2026-11-25 — ef4ddb15 (CHAT)]]




# Robot SDK feedback


Ok I love this


![[Pasted image 20261124203022.png]]

and you can really usign like the techagui plugin to do this routing...


Ok so I like the package view that very nice I like it like a tree.

I almost wonder thoug for the Types view if it makes more sense to show it more like a pipeline?

So you have the package

and then yes you basically each package will define its public API by types. consumer or produce

That allows us to direcitonall connect all the packages. and now you kinda just lay them out.

Robot msgs is hidden in this case... its the glue between everything

sI think in this view we should also have the option to like group by layer or turn of the layer groudping

that can just be a check mark here:
![[Pasted image 20261124203341.png]]

I like this more directory like view

![[Pasted image 20261124203415.png]]


I do like how compact this directory view is as well though:


Mabye you can like switch between like cards vs compact

I really like the h![[Pasted image 20261124203537.png]]eal


I reall like the health view super duper important can we can have that first class supported.

Very common with like these packages you want to be able to see like what is passing or not

Ok another thing to make clear here is like our pinned versions...

Just like ros as the different pinned versions we want that to be first class as well...

So you can I like it like github kinda skip to like a branch

by default it can be live. but then you can always go back to like the latest stable or previous ones

![[Pasted image 20261124203759.png]]

I feel like that could be in the top right corner or something. next to like a github icon that takes you to the github repo


I really really really like this type view

![[Pasted image 20261124203929.png]]

We 100% should support this type of view...

Its a functional robot library so if you want to understand it moving around by the types is 100% the right way to navigate

and lets say you have a joint trajecotyr and you want to know what you can do with it? well now you can quickly find out!!



I don't likve anythin gfrom v3


I Like v1 alot and I like v2

They are kinda like seperate things though...


So I almost feel like right now we have the single landing page design but we need to switch to more of a site layout

Where we have like a couple different "workspaces" you can shift to.
```
