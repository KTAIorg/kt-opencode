                                           Can Large Language Models Write Good Property-Based Tests?
                                                                          Vasudev Vikram                                                                   Caroline Lemieux
                                                                   Carnegie Mellon University                                                        University of British Columbia
                                                                   Pittsburgh, PA, United States                                                        Vancouver, BC, Canada
                                                                         vasumv@cmu.edu                                                                  clemieux@cs.ubc.ca

                                                                          Joshua Sunshine                                                                    Rohan Padhye
                                                                   Carnegie Mellon University                                                         Carnegie Mellon University
                                                                   Pittsburgh, PA, United States                                                      Pittsburgh, PA, United States
                                                                       sunshine@cs.cmu.edu                                                               rohanpadhye@cmu.edu
arXiv:2307.04346v2 [cs.SE] 22 Jul 2024




                                         ABSTRACT                                                                                      1   INTRODUCTION
                                         Property-based testing (PBT), while an established technique in                               Property-based testing (PBT) is a powerful testing technique for
                                         the software testing research community, is still relatively under-                           testing properties of a program through generation of inputs. Un-
                                         used in real-world software. Pain points in writing property-based                            like traditional testing methods that rely on manually written test
                                         tests include implementing diverse random input generators and                                cases and examples, PBT uses automatic generation of a wide range
                                         thinking of meaningful properties to test. Developers, however, are                           of inputs to invoke a diverse set of program behaviors. PBT was
                                         more amenable to writing documentation; plenty of library API                                 first popularized by the Quickcheck [1] library in Haskell, and has
                                         documentation is available and can be used as natural language                                been used to find a plethora of bugs in a variety of real-world soft-
                                         specifications for PBTs. As large language models (LLMs) have re-                             ware [2–5]. Additional techniques built on top of PBT [6–8] have
                                         cently shown promise in a variety of coding tasks, we investigate                             demonstrated potential in providing stronger testing for software.
                                         using modern LLMs to automatically synthesize PBTs using two                                     Despite its proven results and impact in the research community,
                                         prompting techniques. A key challenge is to rigorously evaluate                               PBT is not as widely adopted by open source and industry soft-
                                         the LLM-synthesized PBTs. We propose a methodology to do so                                   ware developers. Using the Open Source Insights [9] dependency
                                         considering several properties of the generated tests: (1) validity,                          dataset, we find that only 222 out of 180,000 PyPI packages list the
                                         (2) soundness, and (3) property coverage, a novel metric that mea-                            Python PBT library Hypothesis as a dependency, despite it being a
                                         sures the ability of the PBT to detect property violations through                            very popular project (6.7k+ stars on GitHub). Harrison et al. [10]
                                         generation of property mutants. In our evaluation on 40 Python                                conducted a series of interviews and detail a set of challenges faced
                                         library API methods across three models (GPT-4, Gemini-1.5-Pro,                               by professional developers when attempting to use PBT in their
                                         Claude-3-Opus), we find that with the best model and prompting                                software. Developers reported difficulties in (1) writing random
                                         approach, a valid and sound PBT can be synthesized in 2.4 samples                             data generators for inputs and (2) articulating and implementing
                                         on average. We additionally find that our metric for determining                              properties that would meaningfully test their code. Furthermore,
                                         soundness of a PBT is aligned with human judgment of property                                 Harrison et al. describe the “critical mass problem” that PBT is still
                                         assertions, achieving a precision of 100% and recall of 97%. Finally,                         relatively unknown and unpopular among the software industry.
                                         we evaluate the property coverage of LLMs across all API meth-                                   While developers have been reticent to adopt PBT, the practice
                                         ods and find that the best model (GPT-4) is able to automatically                             of documenting code is widespread. Documentation for library API
                                         synthesize correct PBTs for 21% of properties extractable from API                            methods is fairly common, especially for languages like Python,
                                         documentation.                                                                                and contains valuable information about input parameters and
                                                                                                                                       properties of the output. An truncated version of the documentation
                                         ACM Reference Format:                                                                         for the numpy.cumsum API method can be seen in Figure 1.
                                         Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye.                             Recently, the use of pre-trained large language models (LLMs) for
                                         2024. Can Large Language Models Write Good Property-Based Tests?. In                          code generation has become increasingly popular [11–13]. LLMs
                                         Proceedings of ACM Conference (Conference’17). ACM, New York, NY, USA,                        have been effective at translating natural language specifications
                                         12 pages. https://doi.org/10.1145/nnnnnnn.nnnnnnn                                             and instructions to concrete code [14, 15]. Additionally, LLMs have
                                                                                                                                       shown potential to improve existing automated unit test generation
                                                                                                                                       techniques [16], and even generate unit tests from scratch [17, 18].
                                                                                                                                       In this paper, we investigate the potential of using LLMs to generate
                                         Permission to make digital or hard copies of all or part of this work for personal or
                                         classroom use is granted without fee provided that copies are not made or distributed
                                                                                                                                       property-based tests when provided API documentation. We believe
                                         for profit or commercial advantage and that copies bear this notice and the full citation     that the documentation of an API method can assist the LLM in
                                         on the first page. Copyrights for components of this work owned by others than ACM            producing logic to generate random inputs for that method and
                                         must be honored. Abstracting with credit is permitted. To copy otherwise, or republish,
                                         to post on servers or to redistribute to lists, requires prior specific permission and/or a   deriving meaningful properties of the result to check.
                                         fee. Request permissions from permissions@acm.org.                                               While LLMs have shown effectiveness in synthesizing unit
                                         Conference’17, July 2017, Washington, DC, USA                                                 tests [19] and fuzz harnesses [20–22], synthesizing property-based
                                         © 2024 Association for Computing Machinery.
                                         ACM ISBN 978-x-xxxx-xxxx-x/YY/MM. . . $15.00                                                  tests has unique challenges. In unit testing, the test oracles are usu-
                                         https://doi.org/10.1145/nnnnnnn.nnnnnnn                                                       ally simple equality assertions between expected and actual outputs;
Conference’17, July 2017, Washington, DC, USA                                         Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye


                                                                              1   from hypothesis import given, strategies as st
                                                                              2   import numpy as np
                                                                              3
                                                                              4   # Summary: Generate random input parameters for
                                                                              5   # numpy.cumsum and test properties
                                                                              6   @given(st.data())
                                                                              7   def test_numpy_cumsum(data):
                                                                              8       # Generating a list with varying length
                                                                              9       # and integer elements
                                                                             10       a = data.draw(st.lists(
                                                                             11           st.integers(min_value=-10, max_value=10),
                                                                             12           min_size=0, max_size=10))
                                                                             13
                                                                             14       # Generate random axis
                                                                             15       axis = data.draw(st.one_of(st.none(),
                                                                             16           st.integers(min_value=0,
                                                                             17                   max_value=a.ndim-1)))
                                                                             18
                                                                             19       # Call numpy.cumsum with generated input
                                                                             20       cumsum_result = np.cumsum(a, axis=axis)
                                                                             21
                                                                             22       # Test property: output shape
Figure 1: Truncated Numpy documentation for the                              23       # should be the same as input shape
numpy.cumsum API method. The documentation includes                          24       # if axis is not None or input is 1-d array
descriptions of properties about the result shape/size and                   25       if axis is not None or a.ndim == 1:
                                                                             26           assert cumsum_result.shape == a.shape
additional information about the last element of the result.                 27
                                                                             28       # Test property: output size should be the
                                                                             29       # same as input size
                                                                             30       assert cumsum_result.size == a.size
in PBT, a property assertion that holds generally for inputs must
                                                                             31
be synthesized in the test. Similarly, fuzz harnesses usually only           32     # Test property: cumsum(a)[-1] should be
contain implicit oracles that capture unexpected behaviors such              33     # approximately equal to sum(a) for
as uncaught exceptions or crashes. Further, synthesizing property-           34     # non floating-point values
based tests requires generating custom logic for random input                35     if not np.issubdtype(a.dtype, np.floating):
                                                                             36         np.testing.assert_almost_equal(
generation over various types of inputs; unit tests do not require           37                 cumsum_result.flatten()[-1],
this logic since there is only one input, and fuzz harnesses primarily                               np.sum(a))
rely on inputs represented as raw byte streams.                              38 # End program
    An example of using LLMs for PBT can be seen in Figure 2,
which displays an LLM-synthesized property-based test for the                Figure 2: A GPT-4 generated property based test for
numpy.cumsum method when provided the documentation in                       numpy.cumsum. The test first generates random integer ar-
Figure 1. First, the logic for generating random values for the in-          rays between size 1 and 20 and a random axis. Then, the API
put parameters a and axis is in lines 10–17. Then, the cumsum                method under test np.cumsum is invoked on the randomly
method is invoked on these arguments on line 20. Finally, lines 25–          generated inputs. Finally, three properties are checked on
37 contain property assertions for the output cumsum_result.                 the output array, all derived from information in the API
We specifically note that these properties assertions match natural          documentation. All comments are also generated by GPT-4.
language descriptions in the API documentation in Figure 1. The
documentation specifies that “result has the same size as a”, which
has a direct translation to the assertion in line 30. Similarly, the spec-   do we know whether an LLM-synthesized property-based test is
ification that result has “the same shape as a if axis is not None or        good enough? We characterize several desirable properties of these
a is a 1-d array” is checked conditionally as an assertion in lines 25–      tests and propose a methodology to evaluate the LLM’s output:
26. Finally, the property assertion shown in lines 35–37 checks that         property-based tests must be valid (free of compile-time or run-time
the last element of the result is equal to np.sum(a) if the array is         errors), sound (only assert properties that must be true), and ideally
not of float type. This assertion translates information from the            complete (i.e., actually check for properties that are mentioned in
notes section in the documentation into a useful property to check.          the API documentation). To measure completeness of property
While not a perfect property-based test, this example demonstrates           assertions, we introduce the notion of property coverage, which
the ability of LLMs to write logic for generating random inputs and          uses mutation testing to measure the ability of a property-based test
derive meaningful property assertions from API documentation.                to fail when the target API method behaves in a way that violates
    In this paper, we study the use of state-of-the-art LLMs—Open            its documented property. We evaluate our three models across two
AI’s GPT-4, Anthropic’s Claude-3-Opus, and Google’s Gemini-1.5.-             prompting strategies on 40 API methods across 10 Python libraries.
Pro—to automatically synthesize property-based tests. We propose             We find that with the best-performing approach (GPT-4 with two-
single stage and two stage approaches for using API documentation            stage prompting), a valid and sound property-based test can be
to prompt the LLM to synthesize property-based tests. But how                synthesized over 2.4 samples on average, and that a correct PBT
Can Large Language Models Write Good Property-Based Tests?                                                 Conference’17, July 2017, Washington, DC, USA


can be synthesized for over 20% of the documented properties.                  1   from hypothesis import given, strategies as st
We thus find LLM-based PBT generation a suitable approach for                  2
                                                                               3   # Random list generator
automating some of the tedious process of writing property-based               4   @st.composite
tests.                                                                         5   def generate_lists(draw):
   In summary, our contributions are the following:                            6     return draw(st.lists(elements=st.integers(),
                                                                               7                         min_size=1))
   (1) We propose an approach for using LLMs to synthesize                     8
       property-based tests given API documentation.                           9   # Property-based test for sorted with
                                                                              10   # separate generator
   (2) We propose a methodology for evaluating LLM-synthesized                11   @given(lst=generate_lists())
       property-based tests considering validity, soundness, and              12   def test_sorted_separate(lst):
       completeness.                                                          13     sorted_lst = sorted(lst)
   (3) We demonstrate alignment between our metric for sound-                 14     assert all(sorted_lst[i] <= sorted_lst[i + 1]
                                                                              15                 for i in range(len(sorted_lst) - 1))
       ness and human judgment through manual labeling.
                                                                              16
   (4) We propose a novel metric of property coverage for measuring           17   # Alternative property-based test
       completeness with respect to documented properties.                    18   # with inline generator
   (5) We present an empirical evaluation of the validity, soundness,         19   @given(st.data())
       and property coverage of PBTs synthesized by three state-of-           20   def test_sorted_combined(data):
                                                                              21     lst = data.draw(st.lists(elements=st.integers(),
       the-art commercial LLMs across two prompting strategies.               22                                min_size=1))
                                                                              23     sorted_lst = sorted(lst)
                                                                              24     assert all(sorted_lst[i] <= sorted_lst[i + 1]
2 BACKGROUND                                                                  25                     for i in range(len(sorted_lst) -
                                                                                                          1))
2.1 Property-based Testing
Property-based testing [1] aims to probabilistically test a program
by generating a large number of random inputs and checking                    Figure 3: Example property-based tests in Hypothe-
whether the corresponding outputs of the program adhere to a set              sis for the Python sorted function to sort lists. The
of desired properties. A property-based test can be defined as the fol-       test_sorted_separate function uses a separate gener-
lowing: given a function/method under test 𝑓 , an input space X, and          ator, whereas the function test_sorted_combined com-
a property 𝑃, we want to validate that ∀𝑥 ∈ X : 𝑃 (𝑥, 𝑓 (𝑥)). Often, 𝑃        bines the generator and testing logic into one function.
is a conjunction of component properties, that is, 𝑃 = 𝑝 1 ∧𝑝 2 ∧. . . 𝑝𝑘 .
In practice, we are unable to enumerate all inputs in X. So, we write
a generator function gen that produces a random input in X, i.e.              there is no assertion failure. Generally, if 𝑃 had multiple component
𝑥 = gen(). Then we write a parametrized test 𝑇 :: 𝑋 → {true, false}           properties, there would be a list of assertion statements in 𝑇 .
that returns 𝑃 (𝑥, 𝑓 (𝑥)). The property is checked on many randomly              Finally, to complete the property-based test, we must invoke our
generated 𝑥. A violation of the property causes the test to fail. Al-         generator to sample random inputs and call the parametrized test
though PBT cannot prove the absence of property violations, it                on the input. This is done using the Hypothesis @given decora-
improves over testing specific hard-coded inputs and outputs as is            tor, as seen in line 11. The decorator specifies that the input lst
commonly done in unit testing. PBT is thus a form of fuzz testing.            of our parametrized test test_sorted_separate should use
    We next describe how our formal definition translates to code in          generate_lists as the generator.
Hypothesis [7], a popular PBT library for Python.                                Another style of writing a Hypothesis test is to include the
    Suppose our function under test is the Python sorted function,            generator inside the parametrized test, as seen in the func-
which takes in a list as input and returns a sorted version. We               tion test_sorted_combined in Figure 3. At line 19, the
want to test the property that the elements of the sorted list are            @given(data()) decorator provides an object which can
monotonically increasing.                                                     be used to sample random input data of unspecified type.
    First, we must write our generator gen that samples an input              Lines 21–22 act as the generator, using the same logic as the
from the input space of lists. An example of such a generator is the          generate_lists function to a generate random integer list
generate_lists function in lines 4–7 of Figure 3. Hypothesis                  of with minimum size 1. Lines 23–25 use the method invocation
has a built-in set of sampling strategies for various data structures.        and assertion statements as is in test_sorted_separate. The
The lists and integers strategies in line 6 are used to ran-                  approach of including the generator in the parametrized test has
domly generate and return a Python integer list of size ≥ 1.                  particular advantages when the method under test has multiple
    Next, we must write the parametrized test 𝑇 that takes in an              input parameters that have dependencies with each other. In this
input 𝑥 and returns 𝑃 (𝑥, 𝑓 (𝑥)), where 𝑓 is the sorted function              scenario, each argument can be sequentially generated one at a time
and 𝑃 is the property that the elements of the sorted list are mono-          using generators that depend on previously generated arguments.
tonically increasing. An example of such a parametrized test is                  While the property-based tests shown in Figures 3 are valid and
test_sorted_separate in Figure 3. In line 12, the sorted                      will properly run, they are not necessarily the best property-based
function is invoked on the input lst. Then, lines 14–15 check the             tests for the sorted function. Perhaps the user would like validate
property 𝑃 that elements of the sorted listed are increasing by us-           the behavior of sorted on the empty list, which is not an input
ing an assertion statement. 𝑇 returns true if 𝑃 (𝑥, 𝑓 (𝑥)) is true, i.e.      produced by our generator due to the min_size=1 constraint in
Conference’17, July 2017, Washington, DC, USA                                       Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye


lines 7 and 22. Similarly, the assertions in lines 14–15 and lines 24–25            Single Stage                Two Stage
do not capture all behavior of the sorted function. For instance, it
                                                                                            PBT                   Properties
does not check that lst and sortedlst share the same elements.                            Prompt                   Prompt
We discuss these types of challenges more in Section 3.2.

2.2     Large Language Models                                                                       LLM                       LLM
Pre-trained large language models (LLMs) [15, 23–28] are a class of                                                      Extracted properties
neural networks with a huge number of parameters, trained on large
                                                                                        Property-                 PBT Suite
corpora of text data. These models are trained in an autoregressive
                                                                                        Based Test                 Prompt
manner—i.e., trained to predict the next token in a sequence—which
allows them to be trained on a large volumes of unlabelled text.
This extensive pre-training allows them to function as one-shot or                                                            LLM
zero-shot learners [24]. That is, these models can perform a variety
of tasks when given only one example of the task, or a textual
instruction of the tasks. The natural-language instructions, along                                            Property-Based
with any additional input data, that are passed to the LLM are called                                            Test Suite
the prompt [29]. The practice of creating prompts that allow the
LLMs to effectively solve a target task is called prompt engineering.
                                                                           Figure 4: Two methods of generating property-based test us-
   Further, a number of LLMs have been trained extensively on
                                                                           ing an LLM. The first is a single stage prompt of the LLM with
code [11, 30–33]. These models, as well as more general-purpose
                                                                           zero-shot CoT instructions to (1) explain a generation strat-
LLMs, have been used for numerous software engineering tasks,
                                                                           egy, (2) properties to test, and (3) generate a single property-
including program synthesis [12, 34], program repair [35–37], code
                                                                           based test. The second method instructs the LLM to extract a
explanation [38], and test generation [16–18]. These techniques
                                                                           list of properties from the API docs and continues the conver-
use the LLMs out-of-the-box, getting them to accomplish the tasks
                                                                           sation, instructing the LLM to write a test for each property.
via prompt engineering alone.
   Like prior work, we use pre-trained language models and adapt
them to our tasks only via prompt engineering. We discuss our
methods of constructing these prompts in Section 3.                        from the API (maximum five) and (2) instructing the LLM to create
                                                                           individual property-based test functions for each property. The
                                                                           first prompt contains user-level task instructions to extract five
3 THE PROPTEST-AI APPROACH                                                 properties that hold for all outputs of the API method. The second
3.1 Prompt Design                                                          prompt contains instructions to synthesize a PBT using Hypothesis
To synthesize a property-based test from the LLM, we first design          for each of the properties generated by the LLM. Our full prompt
prompts that include the API documentation and instructions to             templates are available in our data artifact.
write a property-based test for the input method. We explored two
prompting strategies: one to generate a single property-based test         3.2    Evaluation Methodology
and one to generate a property-based testing suite.                        Using our Proptest-AI methodology to prompt the LLM to syn-
  Our high-level prompt templates contains:                                thesize property-based tests, how do we evaluate the quality of
   (1) System-level instructions stating that the LLM is an expert         these generated PBTs? While the effectiveness of unit tests has
       Python programmer.                                                  been a well studied topic for decades [40–43], this is not the case
   (2) The target API documentation, taken from the API website.           for property-based tests. One difficulty in conducting these types of
   (3) User-level task instructions to review the API documentation        evaluations for PBT is the lack of readily available property-based
       and perform a particular task.                                      tests for software. Thankfully, LLMs can provide us a method of
   (4) The desired output format.                                          automatically generating property-based tests for which we can
                                                                           design an evaluation methodology.
   Based on this template, our first prompting strategy generates a           We propose a PBT evaluation methodology and metrics focusing
single property-based test. The user-level task instructions begin         on (1) the validity of the tests, (2) the soundness of the tests, and
with Chain of Thought [39] instructions to outline a generation            (3) the property coverage (detailed in Section 3.2.3) of the tests. To
strategy and a list of properties to test before synthesizing the          motivate each of these metrics, we include examples of inaccurate
property-based test. The prompt ends with instructions to generate         LLM-synthesized PBTs and discuss the issues that impact each
a Hypothesis PBT and adds an output format including Hypothesis            of these qualities. We then propose mitigation strategies for each
import statements, relevant API import statements, a boilerplate           of the inaccuracies that improve the quality of the property-based
function signature, and an example Hypothesis PBT from the Hy-             tests. All of our examples use the Hypothesis PBT library in Python.
pothesis documentation. We refer to this prompt to generate the
entire property-based test as the “PBT Prompt”, as seen in Figure 4.       3.2.1 Validity. One type of incorrect behavior in a property-based
   The second prompting strategy we explore has a two stage                test is a validity issue in which a run-time error is encountered when
prompting method of (1) instructing the LLM to extract properties          the test is executed. The problem of hallucination is a well-known
Can Large Language Models Write Good Property-Based Tests?                                              Conference’17, July 2017, Washington, DC, USA


 1   from hypothesis import strategies as st                               1 @given(generate_array())
 2   from datetime import timedelta                                        2 def test_cumsum(a):
 3                                                                         3   # Test that the shape of the output
 4   @given(days=st.integers(min_value=0),                                 4   # is the same as the input
 5      seconds=st.integers(min_value=0),                                  5   out_shape = np.cumsum(a).shape
 6      microseconds=st.integers(min_value=0),                             6   assert out_shape == a.shape
 7      milliseconds=st.integers(min_value=0),
 8      minutes=st.integers(min_value=0),
 9      hours=st.integers(min_value=0),                                   Figure 6: A Gemini-1.5-Pro generated property-based test con-
10      weeks=st.integers(min_value=0))                                   taining an unsound property for numpy.cumsum on line 6.
11   def test_timedelta_total_seconds(days, seconds,
12       microseconds, milliseconds, minutes,
13       hours, weeks):                                                    1 import numpy as np
14     td = timedelta(days=days, seconds=seconds                           2
15       microseconds=microseconds,                                        3 # Violate Non-Decreasing Sequence
16       milliseconds=milliseconds,                                        4 def buggy_cumsum_1(a,
17       minutes=minutes,                                                  5     axis=None, dtype=None, out=None):
18       hours=hours,                                                      6   result = np.cumsum(a, axis=axis, dtype=dtype,
19       weeks=weeks)                                                      7                         out=out)
20     (...)                                                               8   # Reverse the result to create decreasing elements
                                                                           9   return result[::-1]

Figure 5: An example invalid datetime.timedelta PBT
produced by GPT-4. The datetime.timedelta construc-                       Figure 7: Example property mutant of numpy.cumsum pro-
tor on line 14 raises an OverflowError when the absolute                  duced by GPT-4. The mutant violates the property that the
magnitude of days exceeds 1,000,000.                                      output of numpy.cumsum must be non-decreasing by revers-
                                                                          ing the result.

problem with using LLMs to generate code [44]. LLMs may gener-
ate plausible-looking but incorrect code that throws unexpected           unsound property is higher than the likelihood of a bug. This is a
errors at runtime. This issue arises in property-based testing as well,   weak assumption. We can capture the soundness of a property by
in which the LLM may synthesize test cases that are syntactically         measuring the frequency at which the assertion fails across multiple
valid but result in a runtime error during execution. Since the test      generated inputs. If an assertion fails on a significant percentage of
is executed on multiple random inputs, it is also possible that only      the inputs, it is most likely an unsound property.
a percentage of randomly generated inputs result in runtime errors.          A property-based test is determined as sound if 100% of test
An example is the generator in Figure 5 for timedelta objects             function invocations do not result in assertion errors from the
in the Python datetime module. The generator function can pro-            property checks. We specifically filter out any executions that result
duce values for the timedelta object constructor that may result          in any other runtime errors, as these are related to the validity of
in an OverflowError raised by the datetime.timedelta                      the property-based test rather than the soundness.
constructor when the magnitude of days exceeds 1,000,000. Thus,
                                                                          3.2.3 Property Coverage. While validity and soundness indicate
we determine a property-based test as valid if 100% of test function
                                                                          that a property-based test runs without errors, an additional mea-
invocations do not result in any run-time errors, excluding property
                                                                          surement is needed to evaluate effectiveness at testing specific
assertion errors as these relate to soundness.
                                                                          properties. A property-based test may execute correctly with 100%
3.2.2 Soundness. LLMs may also synthesize a property-based test           validity and 100% soundness, yet inadequately test key properties
that is unsound, i.e., there exists an input/output pair that violates    due to having weak assertions. Our goal is to establish a metric that
a property assertion but is valid given the specification. Figure 6       answers the question: how effective is the property-based test at
provides an example of an LLM-synthesized property-based test for         detecting whether an API method violates a specific property?
the numpy.cumsum method that contains an unsound property                    One related idea is mutation testing, which measures the ability of
on line 6. The numpy.cumsum documentation specifies that for              a test to detect bugs artificially bugs in the program under test [45].
a given input array 𝑎, the output should have "the same shape as          First, mutant versions of the program are created with an artificially
𝑎 if axis is not None or 𝑎 is a 1-d array". The synthesized prop-         injected bug. If the test fails when executing the mutated programs,
erty is unsound because it unconditionally checks whether the             then the mutant is killed; otherwise, the mutant survives. Mutation
output and input shapes match. A randomly generated input of              testing provides a measurement related to the bug-finding capability
array([[0]] produces an assertion failure when this test is run           of a particular test.
since the input shape is (1, 1) and the output shape is (1,);                Mutation testing injects bugs by applying syntactic operators
this is not an actual bug and the behavior of the cumsum method           on the source code; these types of syntactic operators may not
conforms with the API documentation.                                      necessarily correspond to property violations of the API method.
   If we encounter an assertion failure from a property check during      We would like to construct a mutant that performs a property-
the test, how do we know whether it is due to an unsound property         level mutation on the API method. More formally, given a method
or due to a bug in the API implementation? Given an assertion             under test 𝑓 , we would like to generate a mutant 𝑓 ′ such that
failure, we assume that the likelihood of the LLM generating an           ∀𝑥 ∈ X : ¬𝑃 (𝑥, 𝑓 ′ (𝑥)).
Conference’17, July 2017, Washington, DC, USA                                       Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye


  Thus, we define a property mutant as a buggy version of the            Table 1: Modules selected for Proptest-AI evaluation. Selected
API method that returns an output violating a specific property. A       modules consist of native Python libraries (e.g. datetime
property mutant 𝑓 ′ of a method under test 𝑓 is defined as follows:      and statistics) and third-party libraries (e.g. networkx
                                                                         and numpy). The number of API methods selected from each
                                                                         library as well as average token length of the API method
                            𝑓 ′ (𝑥) = mut(𝑓 (𝑥))                         documentation, using the OpenAI tokenizer.

where mut is a mutation operation on 𝑓 (𝑥). The property mutant                                                    # API          Documentation
contains the same signature as the API method, invokes the original             Library
                                                                                                                   Methods        Length (tokens)
API method on the input, and finally performs a mutation operation
                                                                                dateutil                           2              643.5 ± 155.5
on the output to violate the property. Generating this mutation
                                                                                html                               2              81.5 ± 5.5
operation requires semantic reasoning about how an output would                 zlib                               3              312.7 ± 116.8
violate a property.                                                             cryptography.fernet                3              458.7 ± 100.9
   LLMs have been used to perform bug injection and create pro-                 datetime                           4              212.8 ± 83.2
gram mutants [46, 47]. We design a specific prompt for the LLM                  decimal                            5              122.2 ± 68.8
to generate property mutants of a method under test for a given                 networkx                           5              592.8 ± 439.6
property. An example of a property mutant for numpy.cumsum is                   numpy                              5              766.2 ± 242.4
shown in Figure 7. This mutant can return an output that violates               pandas                             5              1197.8 ± 569.7
the property that the output must be non-decreasing by reversing                statistics                         6              318.6 ± 149.5
the order of the output. In order to kill this mutant, the PBT must             Total                              40             -
contain an assertion checking this property and contain logic to
generate inputs of length greater than 1.
   To check whether a property mutant is killed, we create a modi-       4.1     Experimental Setup
fied version of the property-based test. This modified version substi-     Models. We chose three state-of-the-art language models for our
tutes the call to the original API method with the call to the mutant    evaluation: OpenAI’s GPT-4 [48], Anthropic’s Claude-3-Opus [28],
API method. Assuming the original property-based test is valid and       and Google’s Gemini-1.5-Pro [27]. 1
sound, we check whether there is an assertion failure on the output
of the mutant API method in the modified property-based test.               API Methods. We selected API methods from 10 different Python
   We define the property mutation score of a property-based test as     libraries to generate property-based tests across a variety of tasks
the percentage of killed property mutants of a given API method.         and input data types. Table 1 displays the libraries and the number
The process of generating property mutants and measuring prop-           of selected API methods for each library. The libraries include native
erty mutation score is described as follows:                             Python libraries as well as popular third-party libraries such has
                                                                         pandas and numpy. All selected API methods are deterministic,
    (1) Prompt the LLM to extract a list of properties from the API      as this is necessary for property-based testing. The API method
        documentation.                                                   documentation was extracted from the online documentation for
    (2) Prompt the LLM to generate a set of property mutants for         each API method. In total, we selected 40 API methods. The full list
        each property.                                                   of API methods and documentation is provided in the data artifact.
    (3) If the property-based test is sound, execute the property-
                                                                            Approaches. We evaluate two methods of prompting the LLM to
        based test with a substituted call to the property mutant API
                                                                         generate a property-based test shown in Figure 4. (1) A single-stage
        method instead of the original API method.
                                                                         method to generate a single test function and (2) a two-stage method
    (4) Check whether the property assertions fail in the modified
                                                                         to extract properties and generate a property-based test suite of
        property-based test. If so, then the mutant is killed.
                                                                         test functions. With three models and two prompting methods, we
Finally, a property is considered covered if the PBT is able to kill     have a total of 6 approaches.
any of the corresponding property mutants. The overall property             Samples. For each approach, we sample the LLM five times with
coverage of a PBT is the percent of properties for which the PBT is      a temperature of 0.7. In total, we synthesized 1,200 samples across
able to kill property mutants.                                           all API methods and approaches. Out of these samples, only 16
                                                                         either contained no Python or were syntactically invalid Python
4    EVALUATION                                                          code.
Based on our proposed evaluation methodology, we structure our
                                                                         4.2     RQ1: Validity and Soundness
evaluation around three research questions:
RQ1: Are LLMs able to synthesize valid and sound property-based          High validity and soundness for property-based tests are important
tests of API methods when provided documentation?                        for ensuring that the test can run without errors (e.g., calling a
RQ2: Is the execution-based soundness metric for property assertions     nonexistent API or missing an import for a library). For RQ1, we
aligned with human judgment of soundness?                                report the validity and soundness of Proptest-AI synthesized PBTs
RQ3: Are LLMs able to synthesize property-based tests that cover         1We initially included Codellama-34B in our models, but preliminary experiments
documented properties of API methods?                                    showed that the validity of generated PBTs was too low to warramt further evaluation.
Can Large Language Models Write Good Property-Based Tests?                                                                                   Conference’17, July 2017, Washington, DC, USA


Table 2: Proptest-AI synthesized valid and sound test functions across all API methods. 41.74% of the test functions synthesized
using the two-stage prompting approach with GPT-4 achieve 100% validity and 100% soundness.

                 Model              Approach        Total Test Functions   Valid Test Functions                                     Valid and Sound Test Functions
                                    Single Stage             215                    53 (24.65%)                                                 16 (7.44%)
                 Claude-3-Opus
                                    Two Stage                931                   423 (45.43%)                                                289 (31.04%)
                                    Single Stage             220                    39 (17.72%)                                                25 (11.36%)
                 Gemini-1.5-Pro
                                    Two Stage                799                   209 (26.16%)                                                124 (15.51%)
                                    Single Stage             212                 97 (45.75%)                                                    54 (25.47%)
                 GPT-4
                                    Two Stage                733                400 (54.57%)                                                   306 (41.74%)
                 Total              -                        3,110             1,221 (39.26%)                                                  814 (26.17%)


across all API methods, models, and approaches. To measure valid-                                                                     Valid and Sound Test Functions
ity, we call each property-based test function 1,000 times and check                                                                         by Library (GPT-4)
                                                                                                                    Approach
for non-assertion errors; for soundness, we check for assertion                                            80%       Single Stage
                                                                                                                     Two Stage
errors.                                                                                                    70%




                                                                              Percentage Valid and Sound
    Table 2 shows the percent of valid and sound test functions across                                     60%
all API methods for the single-stage and two-stage approaches. We


                                                                                     Test Functions
find that the two-stage prompting achieves significantly higher                                            50%
validity than the single-stage generation for all models. This is likely                                   40%
due to the test functions in the suite being smaller and only testing                                      30%
one specific property, thus having a smaller chance of hallucination.
Similarly, the soundness of test functions synthesized using the                                           20%
two-stage prompting is much higher.                                                                        10%
    Overall, GPT-4 achieves the highest validity and soundness for                                         0%
both single-stage and two-stage prompting. The two-stage ap-
                                                                                                                y

                                                                                                                         e

                                                                                                                                         til

                                                                                                                                          al

                                                                                                                                                        l

                                                                                                                                                       x

                                                                                                                                                                 y

                                                                                                                                                                       as

                                                                                                                                                                              s
                                                                                                                                                                                   zlib
                                                                                                                                                   htm




                                                                                                                                                                             tic
                                                                                                             ph




                                                                                                                                                    ork

                                                                                                                                                              mp
                                                                                                                      im



                                                                                                                                      cim
                                                                                                                               teu




                                                                                                                                                                     nd

                                                                                                                                                                            tis
                                                                                                           gra

                                                                                                                    tet




                                                                                                                                                 tw

                                                                                                                                                            nu

                                                                                                                                                                 pa
                                                                                                                            da
proach with GPT-4 is able to synthesized a valid and sound test
                                                                                                                                    de




                                                                                                                                                                        sta
                                                                                                                 da




                                                                                                                                               ne
                                                                                              pto
                                                                                           cry




function within 2.4 samples on average. Figure 8 shows the dis-
                                                                                                                                                    Library
tribution of valid and sound test functions from GPT-4 across our
10 different libraries. We observe the performance varying across
                                                                                Figure 8: Distribution of valid and sound property-based test
libraries, with validity and soundness much higher on libraries such
                                                                                functions for GPT-4 across all libraries. Certain libraries such
as datetime and zlib.
                                                                                as networkx and pandas have a smaller percentage of valid
    We additionally report average soundness over each test func-
                                                                                and sound test functions than zlib.
tion as the percentage of 1,000 invocations that do not result in
any assertion errors. Figure 10 shows the this distribution over all
synthesized test functions. Although only 814 out of 1,221 valid                Table 3: Human labels of individual property assertions in
test functions achieve 100% soundness (Table 2), this distribution              LLM samples.
shows that the soundness of many of these tests functions close
to 100%. This suggests that the property assertions are correct for
                                                                                                                           Model                  Sound       Unsound
most inputs and outputs, but may fail to capture potential edge
cases.                                                                                                                     Claude-3-Opus            64           23
                                                                                                                           Gemini-1.5-Pro           23           5
                                                                                                                           GPT-4                    86           18
 The best Proptest-AI approach with two-stage prompting and                                                                Total                    173          46
 GPT-4 is able to synthesize valid and sound property-based test
 functions in 2.4 samples on average.

                                                                                selected, evenly distributed for each library. Raters read the docu-
4.3    RQ2: Soundness Metric Alignment                                          mentation for the corresponding API method and labeled the first
Our soundness metric reported in RQ1 provides an execution-based                five assertions as sound or unsound.
measurement for property assertions. However, it is possible that                  Table 3 displays the results of the labeling. We note that the
certain property assertions in the test are not executed due to cer-            difference in the number of labeled assertions per model is due to
tain program paths taken during execution. To further validate                  the difference in validity and the number of property assertions
the soundness of individual property assertions, we performed a                 in each test. We find that out of 219 labeled assertions, 173 (79%)
manual labeling of a sample of synthesized property-based test                  were sound. The soundness of assertions from each model were
assertions. Out of all valid property-based test samples, half were             all similar, ranging from 74–83%. To ensure the reliability of this
Conference’17, July 2017, Washington, DC, USA                                     Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye


Table 4: Property coverage of each model and prompting                    1   import ...
approach across all valid and sound LLM samples. Five prop-               2
erty mutants were generated for each API, and mutants with                3   # Test for networkx.find_cycle
                                                                          4   @given(st.data())
runtime errors were filtered out.
                                                                          5   def test_find_cycle(data):
                                                                          6     (...) # Generator logic for graph G
                                       Property Mutation    Total         7     # verify the properties
   Model               Approach                                           8     try:
                                             Score         Mutants
                                                                          9       cycle = nx.find_cycle(G)
                       Single Stage             58.02%       293         10     except nx.exception.NetworkXNoCycle:
   Claude-3-Opus                                                         11       # The graph doesn't have enough edges
                       Two Stage                59.69%       258
                                                                         12       # to form a cycle
                       Single Stage             43.57%       140         13       assert nx.number_of_edges(G) < num_nodes
   Gemini-1.5-Pro
                       Two Stage                62.70%       244         14
                                                                         15   # Test for date.isocalendar
                       Single Stage             79.78%        89
   GPT-4                                                                 16   @given(y=st.integers(min_value=1, max_value=9999),
                       Two Stage                51.88%       480         17      m=st.integers(min_value=1, max_value=12),
                                                                         18      d=st.integers(min_value=1, max_value=31))
                                                                         19   def test_date_isocalendar(y, m, d):
                                                                         20     try:
manual labeling process, we computed the inter-rater agreement be-       21       d = date(y, m, d)
tween two raters using Cohen’s kappa coefficient (𝜅). The resulting      22       iso_year, iso_week, iso_weekday = d.isocalendar()
𝜅 value of 0.862 ± 0.133 indicates a high level of agreement between     23
the raters, suggesting that the labeling process was consistent.         24       assert iso_week >= 1 and iso_week <= 53
                                                                         25       assert iso_weekday >= 1 and iso_weekday <= 7
    We use our property assertion labels to determine soundness          26       assert iso_year == y or \
for each sample—if any assertions were unsound, the sample was           27           (iso_week == 1 and iso_year == y + 1)
labeled as unsound. We compared these labels to the labels resulting     28     except ValueError:
from our soundness metric and found that our metric has a precision      29       pass
of 100% and recall of 97.14%. There was only one false negative
determined from the soundness metric due to the sample containing        Figure 9: Example snippets from GPT-4 synthesized un-
an unsound assertion that was not executed with an edge-case input       sound property-based tests for networkx.find_cycle and
in the 1,000 invocations.                                                datetime.date.isocalendar. The second property as-
    When labeling property-based tests, we noticed a variety of          sertion in test_find_cycle checks a general property of
soundness issues, ranging from hallucination of properties outside       graphs that was not included in the API documentation that
of the API documentation to assertions only failing due to very          may be unsound when the graph is directed. The last asser-
specific edge cases. The first test in Figure 9 is an example in which   tion in test_date_isocalendar performs a comparison
a property assertion checks that when there is no cycle, the number      to the Gregorian year, but does not account for the case in
of edges in a graph is less than the number of nodes. This property      which the first week of the Gregorian year does not contain
is true for undirected graphs, but not for directed graphs, which        a Thursday.
can be generated as inputs in this PBT.
    Another general pattern we noticed was that the property as-
sertions held for most of the generated inputs, but did not account      containing very simple assertions. Property coverage, described in
for certain edge cases. This explains why many test functions have       Section 3.2.3, measures the ability of the property-based test to kill
soundness of above 80% in the distribution shown in Figure 10. An        property mutants over all properties. This provides a measurement
example of this is the second test in Figure 9. From the API docs, a     of the completeness of synthesized property-based test. Following
property of the ISO calendar is that the “first week of an ISO year is   the steps detailed in Section 3.2.3, we prompt GPT-4 to extract
the first (Gregorian) calendar week of a year containing a Thursday.”    five properties from the documentation for each API method and
This PBT does not account for the case in which the first week of        generate 5 property mutants for each property. In total, there are
the Gregorian year does not contain a Thursday, which occurs for         200 properties we use to calculate overall property coverage.
a small percentage of generated inputs.                                     We first measure property mutation score over all valid and sound
                                                                         LLM. The tests must be sound to ensure that property mutants
  Through manual labeling on a set of LLM samples, we find               are only killed due to assertions checking the property mutant,
  that our soundness metric is aligned with human judgment,              rather than errors in the original test. We additionally filter any
  achieving 100% precision and 97% recall. We observed that              mutants that are killed due to validity errors to specifically measure
  unsound assertions arose from hallucination of properties and          the completeness of the property assertions. For each approach,
  failures to handle edge cases.                                         we report the property mutation score as the average percent of
                                                                         property mutants killed over all samples. Table 4 shows property
                                                                         mutation score for each approach as well as the total number of
4.4     RQ3: Property Coverage                                           mutants that were executed.
RQ3 focuses on evaluating whether LLM-synthesized PBTs can                  Overall, we observe that the valid and sound samples are able to
detect property violations. Tests can be valid and sound while           kill 40–80% of property mutants. These results vary across libraries,
   Can Large Language Models Write Good Property-Based Tests?                                                                                     Conference’17, July 2017, Washington, DC, USA


                                                    Average soundness of test functions                            Table 5: Property coverage of LLM samples over all 40 API
                                                                                                                   methods. In total, there were 200 properties across all API
                                                 100%
                                                                                                                   methods. If any of the five samples kills a property mutant,
                                                 80%
                            Average Soundness
                            (1,000 executions)


                                                                                                                   the property is covered.

                                                 60%
                                                                                                                                                                   Property
                                                                                                                                 Model             Approach
                                                                                                                                                                   Coverage
                                                 40%
                                                                                                                                                   Single Stage         9%
                                                                                                                                 Claude-3-Opus
                                                 20%                                                                                               Two Stage           13%
                                                            Single Stage
                                                            Two Stage                                                                              Single Stage       5.5%
                                                  0%                                                                             Gemini-1.5-Pro
                                                                                                                                                   Two Stage          12%
                                                        Claude-3-Opus      Gemini-1.5-Pro            GPT-4
                                                                                 Model                                           GPT-4
                                                                                                                                                   Single Stage        7%
                                                                                                                                                   Two Stage         20.50%
   Figure 10: Violin plot displaying soundness distribution
   of valid test functions, aggregated across all API methods
                                                                                                                      Table 5 shows the property coverage for each of our approaches.
   (higher is better). Results for both single-stage and two-stage
                                                                                                                   The best approach of two-stage prompting with GPT-4 is success-
   approaches are shown for each model. Overall, GPT-4 with
                                                                                                                   fully able to synthesize property-based tests that are valid, sound,
   two-stage prompting achieves the highest average soundness
                                                                                                                   and cover 20.5% of properties. We believe this is a promising re-
   of 87% over all valid test functions.
                                                                                                                   sult, as Proptest-AI is able to automate a significant portion of
                                                                                                                   the property-based testing writing process and cover extracted
                                                          Property Mutation Score of Samples                       docuemntation properties.

                            80%                                                                                     The two-stage prompting approach with GPT-4 is successfully
                                                                                                                    able to automatically synthesize PBTs covering 20.5% of docu-
Percent of Killed Mutants




                                                                                                                    mented properties.
                            60%

                                                                                                                   5 THREATS TO VALIDITY
                            40%
                                                                                                                   5.1 Construct Validity
                            20%                                                                                    Our measurements of validity and soundness are dependent on
                                                                                                                   the executions of the property-based tests, which contain logic for
                                                                                                                   random input generation. Additionally, due to the nondetermin-
                              0%                                                                                   istic nature of LLMs, it is possible to get a range of samples that
                                        y

                                                      e

                                                              s

                                                                     til

                                                                            al

                                                                                          l

                                                                                              zlib


                                                                                                       x

                                                                                                              as
                                                                                     htm
                                                           tic
                                    ph




                                                                                                     ork
                                                   im




                                                                           cim
                                                                  teu




                                                                                                                   achieve varying degrees of performance. We aim to mitigate this
                                                                                                             nd
                                                          tis
                               gra

                                                  tet




                                                                                                     tw

                                                                                                             pa
                                                                  da

                                                                           de
                                                        sta
                                                 da




                                                                                                 ne
                     pto




                                                                                                                   nondeterminism by sampling from each LLM five times and exe-
         cry




                                                                                Library                            cuting the property-based tests 1,000 times, which is the standard
                                                                                                                   for Hypothesis property-based tests.
   Figure 11: Distribution of property mutation score over li-
   braries across all valid and sound tests (higher is better). Gen-                                               5.2    Internal Validity
   erally, the tests achieve higher property mutation score from                                                   One threat to internal validity comes from our execution-based
   native Python libraries such as statistics and datetime.                                                        definition of soundness. It is possible that an assertion error results
   Property mutants from networkx require stronger asser-                                                          from an actual bug rather than an unsound assertion. Our manual
   tions to detect.                                                                                                labeling process independently evaluated the soundness of property
                                                                                                                   assertions, thus providing a stronger judgment.
                                                                                                                      Another threat to internal validity is the existence of equivalent
   as shown in Figure 11. Samples achieve higher property cover-                                                   mutants, which is a well studied problem in mutation testing [49].
   age in native Python libraries such as datetime and decimal.                                                    Many equivalent mutants arise due to the mutation at the source
   networkx requires stronger assertions that are more difficult to                                                code level not propagating to the output of the program [50]. Our
   synthesize due to the complexity of graph properties.                                                           formulation of property mutants applies the mutation directly to
      We finally calculate the property coverage of all approaches on                                              the output of the API method rather than the source code, which
   the entire set of 40 Python APIs. With five samples of an LLM for                                               mitigates this issue. However, in specific cases the output may
   a synthesized PBT, how many properties can be covered? For a                                                    remain equivalent after the mutation operator.
   property to be covered, the sample must be valid, sound, and kill at                                               Finally, since we do not have access to the training set for any
   least one property mutant. This measures the overall ability of the                                             of the selected LLMs, we cannot confirm whether existing PBTs for
   LLM to synthesize a PBT achieving all of our desired properties.                                                our API methods are part of this set. However, we checked each
Conference’17, July 2017, Washington, DC, USA                                     Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye


of our selected Python library repositories and did not find any         assertions. However, the approaches have the potential to detect
Hypothesis PBTs for any of the selected API methods.                     bugs in the implementation being analyzed, unlike regression ora-
                                                                         cles. As these tools use traditional NLP, the concerns of validity are
5.3     External Validity                                                less severe than for hallucination-prone LLM-based techniques.
                                                                            Specialized deep learning techniques have also been proposed
We selected Python as a target language since LLMs have tradition-
                                                                         to generate oracles. ATLAS [63] trains a Neural Machine Trans-
ally performed well with Python and Hypothesis is an extensive
                                                                         lation model on a dataset of (test case, oracle) pairs, and uses the
Python property-based testing library. We do not know of our
                                                                         trained model to generate oracles on new test cases. The NMT
conclusions will generalize to other programming languages or
                                                                         model predicts token sequences, avoiding some basic syntactic
property-based testing libraries since this will impact the ability of
                                                                         validity problems. TOGA [64] avoids the problem of validity by
the LLM to generate valid code. Another threat to external validity
                                                                         defining a grammar of possible assertions, and having the deep
is the selection of our evaluation targets of Python API methods.
                                                                         learning model choose a production in this grammar. However, the
We synthesized and evaluated property-based tests for a variety of
                                                                         problems of soundness and strength remain.
native and popular Python libraries for which API documentation
                                                                            Unlike regular unit tests, which encode properties of a sin-
is readily available. Since these are established Python libraries, it
                                                                         gle input, the PBTs we generate encode properties over arbitrary
is likely that the API documentation and source code exist in the
                                                                         generator-generated inputs. The problem of effectively searching
training data of the LLMs. While we do not know of our conclusions
                                                                         the input space, so that the PBT shows a bug, is orthogonal to our
will generalize to new libraries and APIs, prior work [51, 52] has
                                                                         current work. LLM-synthesized generators could be paired with cov-
shown the effectiveness of providing documentation to LLMs to
                                                                         erage guidance [6, 8], validity-biased guidance [65], reinforcement-
perform code generation for unknown APIs and languages.
                                                                         learning guidance [66], or behavioral diversity guidance [67], to
                                                                         produce more “interesting” test inputs. Fuzz4All [68] applies LLMs
6     RELATED WORK                                                       to guide and mutate input generation in fuzzing.
To the best of our knowledge, no work has yet attempted to use              The problem of fuzz harness or fuzz driver generation bears sim-
LLMs to automate the creation of property-based tests.                   ilarity to our property generation problem [69, 70]. In fuzz driver
   LLMs have been used to aid in various testing tasks, including:       generation, the goal is to take unstructured byte data provided
generating tests cases for search-based unit test generation [16],       by the fuzz tester, and use it to exercise the program under test
co-generating code and unit-tests in an interactive manner [17], and     in a meaningful manner. The generated fuzz drivers resemble the
generating unit tests [18, 53–55]. TestPilot [18] uses fully automated   “combined” PBT shown in Figure 3, which consumes random data
prompt refinement when generating unit tests. In particular, when        and uses it directly to construct inputs to exercise the API. As fuzz
a test fails with an error, they enrich the prompt with various forms    testing typically relies only on the crashing oracle (or on crashing
of information—including documentation snippets, the function            oracles provided by instrumentation techniques such as ASAN),
signature, or the error encountered.                                     these works do not engage with the question of soundness or prop-
   In contrast, in TiCoder [17], the goal is to synthesize the im-       erty coverage in the same manner we do. Nevertheless, the need for
plementation of a function from natural language. The system             reasonable assertions emerges from a desire to reduce false positive
concretizes this natural language spec by generating possible unit       bugs. The authors of UTopia [71], which extracts fuzz drivers from
tests for the function being synthesized, and asking the user to         unit tests, note that some unit tests assertions (e.g., checking null
approve the correctness of suggested input/output pairs.                 pointers) must be preserved to maintain property validity. LLMs
   Regardless of whether they use machine learning, automated            also have been applied for the task of fuzz driver generation [20].
unit test generation techniques face some of the challenges we           OSS-Fuzz [22] has a workflow to prompt LLMs for automated fuzz
have outlined. Randoop [56] generates only regression assertions.        driver generation.
Regression assertions simply capture the (possibly buggy) behavior          Finally, retrieval augmented code generation is a technique in
of the program under test at test generation time, and so, their         natural that aims to improve the performance of code generation
soundness with respect to the system specification is in question.       models by incorporating external knowledge from a large corpus
The 𝜇Test [57] approach uses mutation testing to reduce the num-         of source code and related documentation. DocPrompting [51] uses
ber of assertions, and has been adopted in test suite generation         retrieval to fetch relevant documentation pieces for a given natural-
systems such as Evosuite [58] and Pynguin [59]. This addresses           language-to-code task. ARKS [52] proposes active retrieval for code
the completeness of assertions, by keeping around only those asser-      generation, which evolves a “knowledge soup” integration many
tions which can kill mutants. However, the problem of assertion          different forms of knowledge to prompt the LLM. We believe these
soundness remains.                                                       strategies may provide methods of retrieving additional information
   The field of oracle generation typically considers the problem        that could be relevant to synthesizing property-based tests.
of generating an oracle (i.e., a set of property assertions) for a
given test case that lacks assertions. One idea is to extract these
from structured natural language information, such as JavaDoc            7    DATA AVAILABILITY
comments. From JavaDoc comments, TORADOCU [60] extracts                  We have included evaluation data in the anonymized repository
exception oracles; MeMO [61] extracts metamorphic relation ora-          at: https://zenodo.org/doi/10.5281/zenodo.10967487. This data con-
cles; and CallMeMaybe [62] extracts temporal property oracles. Of        tains all of the evaluation data for Proptest-AI, including synthe-
course, imprecision in the JavaDoc comments may lead to unsound          sized property-based tests, property mutants, and measurements
Can Large Language Models Write Good Property-Based Tests?                                                                        Conference’17, July 2017, Washington, DC, USA


for validity, soundness, and property coverage. The API method                                   test-driven user-intent formalization,” arXiv, August 2022. [Online]. Avail-
documentation and prompt templates are also included.                                            able: https://www.microsoft.com/en-us/research/publication/interactive-code-
                                                                                                 generation-via-test-driven-user-intent-formalization/
                                                                                            [18] M. Schäfer, S. Nadi, A. Eghbali, and F. Tip, “Adaptive test generation using a large
                                                                                                 language model,” 2023.
8     CONCLUSION                                                                            [19] M. Schäfer, S. Nadi, A. Eghbali, and F. Tip, “An empirical evaluation of using
In this paper, we explored and identified the unique challenges in                               large language models for automated unit test generation,” IEEE Transactions on
                                                                                                 Software Engineering, 2023.
using LLMs to synthesizing property-based tests. We characterized                           [20] C. Zhang, M. Bai, Y. Zheng, Y. Li, X. Xie, Y. Li, W. Ma, L. Sun, and Y. Liu, “Un-
important properties of good property-based tests to propose an                                  derstanding large language model based fuzz driver generation,” arXiv preprint
                                                                                                 arXiv:2307.12469, 2023.
evaluation methodology that allows us to rigorously evaluate the                            [21] L. Huang, P. Zhao, H. Chen, and L. Ma, “Large language models based fuzzing
LLM outputs. These properties include validity, soundness, and                                   techniques: A survey,” arXiv preprint arXiv:2402.00350, 2024.
coverage of properties in the documentation.                                                [22] D. Liu, J. Metzman, and O. Chang, “Open Source Insights,” https://security.
                                                                                                 googleblog.com/2023/08/ai-powered-fuzzing-breaking-bug-hunting.html, 2023,
   In our evaluation on 40 Python API methods and three state                                    retrieved February 27, 2024.
of the art language models, we find that our two-stage prompting                            [23] M. Shoeybi, M. Patwary, R. Puri, P. LeGresley, J. Casper, and B. Catanzaro,
approach with GPT-4 is able to produce valid and sound PBTs in 2.4                               “Megatron-lm: Training multi-billion parameter language models using model
                                                                                                 parallelism,” arXiv preprint arXiv:1909.08053, 2019.
samples on average. This approach can automatically synthesize                              [24] T. Brown, B. Mann, N. Ryder, M. Subbiah, J. D. Kaplan, P. Dhariwal, A. Neelakan-
PBTs that cover 21% of the documented properties.                                                tan, P. Shyam, G. Sastry, A. Askell et al., “Language models are few-shot learners,”
                                                                                                 Advances in neural information processing systems, vol. 33, pp. 1877–1901, 2020.
                                                                                            [25] A. Chowdhery, S. Narang, J. Devlin, M. Bosma, G. Mishra, A. Roberts, P. Barham,
ACKNOWLEDGMENTS                                                                                  H. W. Chung, C. Sutton, S. Gehrmann et al., “Palm: Scaling language modeling
                                                                                                 with pathways,” arXiv preprint arXiv:2204.02311, 2022.
This research was supported in part by NSF Award CCF-2120955                                [26] R. Thoppilan, D. De Freitas, J. Hall, N. Shazeer, A. Kulshreshtha, H.-T. Cheng,
and by the CyLab Future Enterprise Security Initiative.                                          A. Jin, T. Bos, L. Baker, Y. Du et al., “Lamda: Language models for dialog applica-
                                                                                                 tions,” arXiv preprint arXiv:2201.08239, 2022.
                                                                                            [27] M. Reid, N. Savinov, D. Teplyashin, D. Lepikhin, T. Lillicrap, J.-b. Alayrac, R. Sori-
                                                                                                 cut, A. Lazaridou, O. Firat, J. Schrittwieser et al., “Gemini 1.5: Unlocking mul-
REFERENCES                                                                                       timodal understanding across millions of tokens of context,” arXiv preprint
 [1] K. Claessen and J. Hughes, “Quickcheck: a lightweight tool for random testing               arXiv:2403.05530, 2024.
     of haskell programs,” in Proceedings of the fifth ACM SIGPLAN international            [28] Anthropic, “Introducing the next generation of Claude,” https://www.anthropic.
     conference on Functional programming, 2000, pp. 268–279.                                    com/news/claude-3-family, retrieved April 1, 2024.
 [2] T. Arts, J. Hughes, J. Johansson, and U. Wiger, “Testing telecoms software with        [29] P. Liu, W. Yuan, J. Fu, Z. Jiang, H. Hayashi, and G. Neubig, “Pre-train, prompt,
     quviq quickcheck,” in Proceedings of the 2006 ACM SIGPLAN Workshop on Erlang,               and predict: A systematic survey of prompting methods in natural language
     2006, pp. 2–10.                                                                             processing,” ACM Computing Surveys, vol. 55, no. 9, pp. 1–35, 2023.
 [3] T. Arts, J. Hughes, U. Norell, and H. Svensson, “Testing autosar software with         [30] F. F. Xu, U. Alon, G. Neubig, and V. J. Hellendoorn, “A systematic evaluation of
     quickcheck,” in 2015 IEEE Eighth International Conference on Software Testing,              large language models of code,” in Proceedings of the 6th ACM SIGPLAN Interna-
     Verification and Validation Workshops (ICSTW). IEEE, 2015, pp. 1–4.                         tional Symposium on Machine Programming, 2022, pp. 1–10.
 [4] J. Hughes, “Experiences with quickcheck: testing the hard stuff and staying sane,”     [31] R. Li, L. Ben Allal, Y. Zi, N. Muennighoff, D. Kocetkov, C. Mou, M. Marone,
     in A List of Successes That Can Change the World: Essays Dedicated to Philip Wadler         C. Akiki, J. Li, J. Chim, Q. Liu, E. Zheltonozhskii, T. Y. Zhuo, T. Wang, O. Dehaene,
     on the Occasion of His 60th Birthday. Springer, 2016, pp. 169–186.                          M. Davaadorj, J. Lamy-Poirier, J. Monteiro, O. Shliazhko, N. Gontier, N. Meade,
 [5] J. Hughes, B. C. Pierce, T. Arts, and U. Norell, “Mysteries of dropbox: property-           A. Randy, M.-H. Yee, L. K. Umapathi, J. Zhu, B. Lipkin, M. Oblokulov, Z. Wang,
     based testing of a distributed synchronization service,” in 2016 IEEE International         R. Murthy, J. Stillerman, S. S. Patel, D. Abulkhanov, M. Zocca, M. Dey, Z. Zhang,
     Conference on Software Testing, Verification and Validation (ICST). IEEE, 2016,             N. Fahmy, U. Bhattacharyya, S. Gunasekar, W. Yu, S. Singh, S. Luccioni, P. Villegas,
     pp. 135–145.                                                                                M. Kunakov, F. Zhdanov, M. Romero, T. Lee, N. Timor, J. Ding, C. Schlesinger,
 [6] R. Padhye, C. Lemieux, and K. Sen, “JQF: coverage-guided property-based testing             H. Schoelkopf, J. Ebert, T. Dao, M. Mishra, A. Gu, J. Robinson, C. J. Anderson,
     in Java,” in Proceedings of the 28th ACM SIGSOFT International Symposium on                 B. Dolan-Gavitt, D. Contractor, S. Reddy, D. Fried, D. Bahdanau, Y. Jernite,
     Software Testing and Analysis, 2019, pp. 398–401.                                           C. M. Ferrandis, S. Hughes, T. Wolf, A. Guha, L. von Werra, and H. de Vries,
 [7] D. R. MacIver, Z. Hatfield-Dodds et al., “Hypothesis: A new approach to property-           “STARCODER: May the Source be With You!” 2023. [Online]. Available: https:
     based testing,” Journal of Open Source Software, vol. 4, no. 43, p. 1891, 2019.             //drive.google.com/file/d/1cN-b9GnWtHzQRoE7M7gAEyivY0kl4BYs/view
 [8] L. Lampropoulos, M. Hicks, and B. C. Pierce, “Coverage guided, property based          [32] B. Roziere, J. Gehring, F. Gloeckle, S. Sootla, I. Gat, X. E. Tan, Y. Adi, J. Liu,
     testing,” Proceedings of the ACM on Programming Languages, vol. 3, no. OOPSLA,              T. Remez, J. Rapin et al., “Code llama: Open foundation models for code,” arXiv
     pp. 1–29, 2019.                                                                             preprint arXiv:2308.12950, 2023.
 [9] Google, “Open Source Insights,” https://deps.dev/, retrieved April 27, 2023.           [33] D. Guo, Q. Zhu, D. Yang, Z. Xie, K. Dong, W. Zhang, G. Chen, X. Bi, Y. Wu, Y. Li
[10] H. Goldstein, J. W. Cutler, D. Dickstein, B. C. Pierce, and A. Head, “Property-based        et al., “Deepseek-coder: When the large language model meets programming–the
     testing in practice,” in 2024 IEEE/ACM 46th International Conference on Software            rise of code intelligence,” arXiv preprint arXiv:2401.14196, 2024.
     Engineering (ICSE). IEEE Computer Society, 2024, pp. 971–971.                          [34] J. Austin, A. Odena, M. Nye, M. Bosma, H. Michalewski, D. Dohan, E. Jiang, C. Cai,
[11] M. Chen, J. Tworek, H. Jun, Q. Yuan, H. P. d. O. Pinto, J. Kaplan, H. Edwards,              M. Terry, Q. Le et al., “Program synthesis with large language models,” arXiv
     Y. Burda, N. Joseph, G. Brockman et al., “Evaluating Large Language Models                  preprint arXiv:2108.07732, 2021.
     Trained on Code,” arXiv preprint arXiv:2107.03374, 2021.                               [35] J. A. Prenner and R. Robbes, “Automatic Program Repair with OpenAI’s Codex:
[12] D. Fried, A. Aghajanyan, J. Lin, S. Wang, E. Wallace, F. Shi, R. Zhong, W.-t. Yih,          Evaluating QuixBugs,” arXiv preprint arXiv:2111.03922, 2021.
     L. Zettlemoyer, and M. Lewis, “Incoder: A generative model for code infilling          [36] H. Pearce, B. Tan, B. Ahmad, R. Karri, and B. Dolan-Gavitt, “Can OpenAI Codex
     and synthesis,” arXiv preprint arXiv:2204.05999, 2022.                                      and Other Large Language Models Help Us Fix Security Bugs?” arXiv preprint
[13] S. Bubeck, V. Chandrasekaran, R. Eldan, J. Gehrke, E. Horvitz, E. Kamar, P. Lee,            arXiv:2112.02125, 2021.
     Y. T. Lee, Y. Li, S. Lundberg, H. Nori, H. Palangi, M. T. Ribeiro, and Y. Zhang,       [37] ——, “Examining zero-shot vulnerability repair with large language models,” in
     “Sparks of artificial general intelligence: Early experiments with gpt-4,” 2023.            2023 2023 IEEE Symposium on Security and Privacy (SP) (SP). Los Alamitos,
[14] L. Ouyang, J. Wu, X. Jiang, D. Almeida, C. Wainwright, P. Mishkin, C. Zhang,                CA, USA: IEEE Computer Society, may 2023, pp. 1–18. [Online]. Available:
     S. Agarwal, K. Slama, A. Ray et al., “Training language models to follow instruc-           https://doi.ieeecomputersociety.org/10.1109/SP46215.2023.00001
     tions with human feedback,” Advances in Neural Information Processing Systems,         [38] S. Sarsa, P. Denny, A. Hellas, and J. Leinonen, “Automatic Generation of Pro-
     vol. 35, pp. 27 730–27 744, 2022.                                                           gramming Exercises and Code Explanations Using Large Language Models,” in
[15] OpenAI, “Gpt-4 technical report,” 2023.                                                     Proceedings of the 2022 ACM Conference on International Computing Education
[16] C. Lemieux, J. P. Inala, S. K. Lahiri, and S. Sen, “Codamosa: Escaping coverage             Research V. 1, 2022, pp. 27–43.
     plateaus in test generation with pre-trained large language models,” in 45th           [39] T. Kojima, S. S. Gu, M. Reid, Y. Matsuo, and Y. Iwasawa, “Large language models
     International Conference on Software Engineering, ser. ICSE, 2023.                          are zero-shot reasoners,” Advances in neural information processing systems, vol. 35,
[17] S. Lahiri, A. Naik, G. Sakkas, P. Choudhury, C. von Veh, M. Musu-                           pp. 22 199–22 213, 2022.
     vathi, J. P. Inala, C. Wang, and J. Gao, “Interactive code generation via
Conference’17, July 2017, Washington, DC, USA                                                           Vasudev Vikram, Caroline Lemieux, Joshua Sunshine, and Rohan Padhye


[40] J. B. Goodenough and S. L. Gerhart, “Toward a theory of test data selection,” in             Software Engineering, 2022, pp. 2130–2141.
     Proceedings of the international conference on Reliable software, 1975, pp. 493–510.    [65] R. Padhye, C. Lemieux, K. Sen, M. Papadakis, and Y. Le Traon, “Semantic Fuzzing
[41] P. G. Frankl and O. Iakounenko, “Further empirical studies of test effectiveness,”           with Zest,” in Proceedings of the 28th ACM SIGSOFT International Symposium on
     in Proceedings of the 6th ACM SIGSOFT international symposium on Foundations                 Software Testing and Analysis, 2019, pp. 329–340.
     of software engineering, 1998, pp. 153–162.                                             [66] S. Reddy, C. Lemieux, R. Padhye, and K. Sen, “Quickly generating diverse valid
[42] G. Fraser and A. Arcuri, “A large-scale evaluation of automated unit test genera-            test inputs with reinforcement learning,” in Proceedings of the ACM/IEEE 42nd
     tion using evosuite,” ACM Transactions on Software Engineering and Methodology               International Conference on Software Engineering, 2020, pp. 1410–1421.
     (TOSEM), vol. 24, no. 2, pp. 1–42, 2014.                                                [67] H. L. Nguyen and L. Grunske, “Bedivfuzz: integrating behavioral diversity into
[43] S. Shamshiri, R. Just, J. M. Rojas, G. Fraser, P. McMinn, and A. Arcuri, “Do auto-           generator-based fuzzing,” in Proceedings of the 44th International Conference on
     matically generated unit tests find real faults? an empirical study of effectiveness         Software Engineering, 2022, pp. 249–261.
     and challenges (t),” in 2015 30th IEEE/ACM International Conference on Automated        [68] C. S. Xia, M. Paltenghi, J. Le Tian, M. Pradel, and L. Zhang, “Fuzz4all: Universal
     Software Engineering (ASE). IEEE, 2015, pp. 201–211.                                         fuzzing with large language models,” Proc. IEEE/ACM ICSE, 2024.
[44] A. Fan, B. Gokkaya, M. Harman, M. Lyubarskiy, S. Sengupta, S. Yoo, and J. M.            [69] D. Babić, S. Bucur, Y. Chen, F. Ivančić, T. King, M. Kusano, C. Lemieux, L. Szekeres,
     Zhang, “Large language models for software engineering: Survey and open                      and W. Wang, “Fudge: fuzz driver generation at scale,” in Proceedings of the
     problems,” arXiv preprint arXiv:2310.03533, 2023.                                            2019 27th ACM Joint Meeting on European Software Engineering Conference and
[45] R. DeMillo, R. Lipton, and F. Sayward, “Hints on test data selection: Help for the           Symposium on the Foundations of Software Engineering, 2019, pp. 975–985.
     practicing programmer,” Computer, vol. 11, no. 4, pp. 34–41, 1978.                      [70] K. K. Ispoglou, D. Austin, V. Mohan, and M. Payer, “Fuzzgen: Automatic fuzzer
[46] A. R. Ibrahimzada, Y. Chen, R. Rong, and R. Jabbarvand, “Automated bug gen-                  generation,” in Proceedings of the 29th USENIX Conference on Security Symposium,
     eration in the era of large language models,” arXiv preprint arXiv:2310.02407,               2020, pp. 2271–2287.
     2023.                                                                                   [71] B. Jeong, J. Jang, H. Yi, J. Moon, J. Kim, I. Jeon, T. Kim, W. Shim, and
[47] A. Garg, R. Degiovanni, M. Papadakis, and Y. Le Traon, “On the coupling between              Y. Hwang, “Utopia: Automatic generation of fuzz driver using unit tests,” in
     vulnerabilities and llm-generated mutants: A study on vul4j dataset.”                        2023 2023 IEEE Symposium on Security and Privacy (SP) (SP). Los Alamitos,
[48] J. Achiam, S. Adler, S. Agarwal, L. Ahmad, I. Akkaya, F. L. Aleman, D. Almeida,              CA, USA: IEEE Computer Society, may 2023, pp. 746–762. [Online]. Available:
     J. Altenschmidt, S. Altman, S. Anadkat et al., “Gpt-4 technical report,” arXiv               https://doi.ieeecomputersociety.org/10.1109/SP46215.2023.00043
     preprint arXiv:2303.08774, 2023.
[49] B. J. Grün, D. Schuler, and A. Zeller, “The impact of equivalent mutants,” in
     2009 International Conference on Software Testing, Verification, and Validation
     Workshops. IEEE, 2009, pp. 192–199.
[50] R. Just, M. D. Ernst, and G. Fraser, “Efficient mutation analysis by propagating
     and partitioning infected execution states,” in Proceedings of the 2014 international
     symposium on software testing and analysis, 2014, pp. 315–326.
[51] S. Zhou, U. Alon, F. F. Xu, Z. Wang, Z. Jiang, and G. Neubig, “Docprompting:
     Generating code by retrieving the docs,” arXiv preprint arXiv:2207.05987, 2022.
[52] H. Su, S. Jiang, Y. Lai, H. Wu, B. Shi, C. Liu, Q. Liu, and T. Yu, “Arks: Active
     retrieval in knowledge soup for code generation,” arXiv preprint arXiv:2402.12317,
     2024.
[53] P. Bareiß, B. Souza, M. d’Amorim, and M. Pradel, “Code generation tools (almost)
     for free? a study of few-shot, pre-trained language models on code,” arXiv preprint
     arXiv:2206.01335, 2022.
[54] N. Rao, K. Jain, U. Alon, C. Le Goues, and V. J. Hellendoorn, “Cat-lm training
     language models on aligned code and tests,” in 2023 38th IEEE/ACM International
     Conference on Automated Software Engineering (ASE). IEEE, 2023, pp. 409–420.
[55] N. Alshahwan, J. Chheda, A. Finegenova, B. Gokkaya, M. Harman, I. Harper,
     A. Marginean, S. Sengupta, and E. Wang, “Automated unit test improvement
     using large language models at meta,” arXiv preprint arXiv:2402.09171, 2024.
[56] C. Pacheco and M. D. Ernst, “Randoop: feedback-directed random testing for
     Java,” in Companion to the 22nd ACM SIGPLAN conference on Object-oriented
     programming systems and applications companion, 2007, pp. 815–816.
[57] G. Fraser and A. Zeller, “Mutation-driven generation of unit tests and oracles,” in
     Proceedings of the 19th International Symposium on Software Testing and Analysis,
     ser. ISSTA ’10. New York, NY, USA: Association for Computing Machinery,
     2010, p. 147–158. [Online]. Available: https://doi.org/10.1145/1831708.1831728
[58] G. Fraser and A. Arcuri, “Evosuite: automatic test suite generation for object-
     oriented software,” in Proceedings of the 19th ACM SIGSOFT symposium and
     the 13th European conference on Foundations of software engineering, 2011, pp.
     416–419.
[59] S. Lukasczyk and G. Fraser, “Pynguin: Automated unit test generation for python,”
     in Proceedings of the ACM/IEEE 44th International Conference on Software Engi-
     neering: Companion Proceedings, 2022, pp. 168–172.
[60] A. Goffi, A. Gorla, M. D. Ernst, and M. Pezzè, “Automatic generation of oracles
     for exceptional behaviors,” in Proceedings of the 25th International Symposium
     on Software Testing and Analysis, ser. ISSTA 2016. New York, NY, USA:
     Association for Computing Machinery, 2016, p. 213–224. [Online]. Available:
     https://doi.org/10.1145/2931037.2931061
[61] A. Blasi, A. Gorla, M. D. Ernst, M. Pezzè, and A. Carzaniga, “MeMo: Automatically
     identifying metamorphic relations in Javadoc comments for test automation,”
     Journal of Systems and Software, vol. 181, p. 111041, 2021. [Online]. Available:
     https://www.sciencedirect.com/science/article/pii/S0164121221001382
[62] A. Blasi, A. Gorla, M. D. Ernst, and M. Pezzè, “Call Me Maybe: Using NLP to
     Automatically Generate Unit Test Cases Respecting Temporal Constraints,” in
     Proceedings of the 37th IEEE/ACM International Conference on Automated Software
     Engineering, ser. ASE ’22. New York, NY, USA: Association for Computing
     Machinery, 2023. [Online]. Available: https://doi.org/10.1145/3551349.3556961
[63] C. Watson, M. Tufano, K. Moran, G. Bavota, and D. Poshyvanyk, “On learning
     meaningful assert statements for unit test cases,” in Proceedings of the ACM/IEEE
     42nd International Conference on Software Engineering, 2020, pp. 1398–1409.
[64] E. Dinella, G. Ryan, T. Mytkowicz, and S. K. Lahiri, “Toga: a neural method for
     test oracle generation,” in Proceedings of the 44th International Conference on
