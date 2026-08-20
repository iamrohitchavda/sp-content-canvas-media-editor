/** @jsxImportSource @revideo/2d/lib */
import { makeScene2D, Rect, Txt, Circle, Line, Img } from "@revideo/2d";
import {
  all,
  createRef,
  easeInOutCubic,
  useScene,
  waitFor
} from "@revideo/core";

const W = 1080;
const H = 1920;
const cx = (percent: number) => W * percent - W / 2;
const cy = (percent: number) => H * percent - H / 2;

/** One dedicated layout per Content Canvas template. */
export default makeScene2D("content-canvas", function* (view) {
  const v = useScene().variables;
  const template = v.get("template", "rating")();
  const accent = v.get("accent", "#f5a623")();
  const mediaSrc = v.get("mediaSrc", "/media/headphones.png")();
  const headline = v.get("headline", "Limited edition release")();
  const hook = v.get("hook", "Happy Customer")();
  const cta = v.get("cta", "Let's Go")();
  const stars = Math.max(1, Math.min(5, Number(v.get("stars", "5")())));
  const discount = v.get("discount", "30")();
  const badge = v.get("badge", "Now Open")();
  const tipNumber = v.get("tipNumber", "1")();
  const title = createRef<Txt>();
  const supporting = createRef<Txt>();

  view.fill("#171720");
  view.add(<Img src={mediaSrc} width={W} height={H} opacity={0.82} />);
  view.add(<Rect width={W} height={H} fill={"#000"} opacity={0.3} />);

  if (template === "rating") {
    const starRow = createRef<Txt>();
    view.add(
      <>
        <Txt
          ref={starRow}
          text={"★".repeat(stars) + "☆".repeat(5 - stars)}
          y={cy(0.62)}
          fill={"#ffc106"}
          fontFamily={"Arial"}
          fontWeight={900}
          fontSize={104}
          letterSpacing={13}
          shadowColor={"#000"}
          shadowBlur={12}
          opacity={0}
          scale={0.7}
        />
        <Txt
          ref={title}
          text={headline}
          y={cy(0.7) + 55}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontWeight={900}
          fontSize={76}
          lineHeight={1.08}
          width={800}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={15}
          opacity={0}
        />
        <Txt
          ref={supporting}
          text={hook}
          y={cy(0.86)}
          fill={accent}
          fontFamily={"Arial"}
          fontWeight={600}
          fontSize={46}
          width={750}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={12}
          opacity={0}
        />
      </>
    );
    yield* all(
      starRow().opacity(1, 0.32),
      starRow().scale(1, 0.42, easeInOutCubic)
    );
    yield* all(
      title().opacity(1, 0.42),
      title().y(cy(0.7), 0.42, easeInOutCubic)
    );
    yield* supporting().opacity(1, 0.35);
    yield* waitFor(1.3);
    return;
  }

  if (template === "offer") {
    const offer = createRef<Circle>();
    view.add(
      <>
        <Circle
          ref={offer}
          size={430}
          y={cy(0.42)}
          fill={accent}
          shadowColor={"#000"}
          shadowBlur={20}
          opacity={0}
          scale={0.6}
        >
          <Txt
            text={`${discount}%\nOFF`}
            fill={"#fff"}
            fontFamily={"Arial"}
            fontWeight={900}
            fontSize={86}
            lineHeight={0.92}
            textAlign={"center"}
          />
        </Circle>
        <Txt
          ref={title}
          text={headline}
          x={cx(0.075) + 410}
          y={cy(0.78) + 55}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontWeight={900}
          fontSize={92}
          lineHeight={1.08}
          width={820}
          textAlign={"left"}
          shadowColor={"#000"}
          shadowBlur={15}
          opacity={0}
        />
        <Txt
          ref={supporting}
          text={hook}
          x={cx(0.075) + 410}
          y={cy(0.89)}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontSize={48}
          width={820}
          textAlign={"left"}
          shadowColor={"#000"}
          shadowBlur={12}
          opacity={0}
        />
      </>
    );
    yield* all(
      offer().opacity(1, 0.25),
      offer().scale(1, 0.38, easeInOutCubic)
    );
  } else if (template === "opening") {
    const opening = createRef<Rect>();
    view.add(
      <>
        <Rect
          ref={opening}
          y={cy(0.17)}
          fill={accent}
          radius={36}
          padding={[34, 64]}
          shadowColor={"#000"}
          shadowBlur={18}
          opacity={0}
          scale={0.7}
        >
          <Txt
            text={badge.toUpperCase()}
            fill={"#fff"}
            fontFamily={"Arial"}
            fontWeight={900}
            fontSize={61}
            letterSpacing={2}
          />
        </Rect>
        <Txt
          ref={title}
          text={headline}
          y={cy(0.5) + 55}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontWeight={900}
          fontSize={92}
          lineHeight={1.08}
          width={850}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={16}
          opacity={0}
        />
        <Txt
          ref={supporting}
          text={hook}
          y={cy(0.605)}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontSize={50}
          width={820}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={12}
          opacity={0}
        />
        <Txt
          text={cta}
          y={cy(0.69)}
          fill={accent}
          fontFamily={"Arial"}
          fontWeight={700}
          fontSize={47}
          width={800}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={12}
        />
      </>
    );
    yield* all(
      opening().opacity(1, 0.25),
      opening().scale(1, 0.38, easeInOutCubic)
    );
  } else if (template === "tip") {
    const numeral = createRef<Circle>();
    view.add(
      <>
        <Circle
          ref={numeral}
          size={190}
          x={cx(0.92)}
          y={cy(0.09)}
          fill={accent}
          shadowColor={"#000"}
          shadowBlur={15}
          opacity={0}
          scale={0.7}
        >
          <Txt
            text={tipNumber}
            fill={"#fff"}
            fontFamily={"Arial"}
            fontWeight={900}
            fontSize={102}
          />
        </Circle>
        <Txt
          ref={title}
          text={headline}
          y={cy(0.46) + 55}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontWeight={900}
          fontSize={88}
          lineHeight={1.08}
          width={830}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={16}
          opacity={0}
        />
        <Txt
          ref={supporting}
          text={cta}
          y={cy(0.64)}
          fill={accent}
          fontFamily={"Arial"}
          fontWeight={700}
          fontSize={48}
          width={800}
          textAlign={"center"}
          shadowColor={"#000"}
          shadowBlur={12}
          opacity={0}
        />
      </>
    );
    yield* all(
      numeral().opacity(1, 0.25),
      numeral().scale(1, 0.36, easeInOutCubic)
    );
  } else {
    const pin = createRef<Circle>();
    view.add(
      <>
        <Line
          points={[
            [0, 135],
            [-112, -28],
            [112, -28]
          ]}
          closed
          fill={accent}
          y={cy(0.6) + 60}
          shadowColor={"#000"}
          shadowBlur={16}
        />
        <Circle
          ref={pin}
          size={235}
          y={cy(0.6) - 35}
          fill={accent}
          shadowColor={"#000"}
          shadowBlur={16}
          opacity={0}
          scale={0.65}
        >
          <Circle size={76} fill={"#fff"} />
        </Circle>
        <Txt
          ref={title}
          text={headline}
          x={cx(0.075) + 410}
          y={cy(0.7) + 55}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontWeight={900}
          fontSize={80}
          lineHeight={1.08}
          width={820}
          textAlign={"left"}
          shadowColor={"#000"}
          shadowBlur={15}
          opacity={0}
        />
        <Txt
          ref={supporting}
          text={cta}
          x={cx(0.075) + 220}
          y={cy(0.865)}
          fill={accent}
          fontFamily={"Arial"}
          fontWeight={700}
          fontSize={43}
          width={400}
          textAlign={"left"}
          shadowColor={"#000"}
          shadowBlur={12}
          opacity={0}
        />
        <Txt
          text={hook}
          x={cx(0.52) + 216}
          y={cy(0.865)}
          fill={"#fff"}
          fontFamily={"Arial"}
          fontSize={42}
          width={420}
          textAlign={"left"}
          shadowColor={"#000"}
          shadowBlur={12}
        />
      </>
    );
    yield* all(pin().opacity(1, 0.28), pin().scale(1, 0.42, easeInOutCubic));
  }

  yield* all(
    title().opacity(1, 0.42),
    title().y(title().y() - 55, 0.42, easeInOutCubic)
  );
  yield* supporting().opacity(1, 0.35);
  yield* waitFor(1.3);
});
